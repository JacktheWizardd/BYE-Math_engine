import type { Node } from './ast.ts';
import type { Fn1 } from './compile.ts';

/** Thrown when an expression has no symbolic derivative here (min, max); callers fall back to numeric. */
export class NoSymbolicDerivative extends Error {
  constructor(what: string) {
    super(`No symbolic derivative for ${what}`);
    this.name = 'NoSymbolicDerivative';
  }
}

// --- smart constructors: fold constants and drop identities so derivative trees stay small

const num = (value: number): Node => ({ type: 'num', value });
const isNum = (n: Node, v?: number): n is { type: 'num'; value: number } => n.type === 'num' && (v === undefined || n.value === v);
const call = (fn: string, ...args: Node[]): Node => ({ type: 'call', fn, builtin: true, order: 0, args });

export function add(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b)) return num(a.value + b.value);
  if (isNum(a, 0)) return b;
  if (isNum(b, 0)) return a;
  if (b.type === 'neg') return sub(a, b.arg);
  return { type: 'bin', op: '+', left: a, right: b };
}
export function sub(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b)) return num(a.value - b.value);
  if (isNum(b, 0)) return a;
  if (isNum(a, 0)) return neg(b);
  return { type: 'bin', op: '-', left: a, right: b };
}
export function mul(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b)) return num(a.value * b.value);
  if (isNum(a, 0) || isNum(b, 0)) return num(0);
  if (isNum(a, 1)) return b;
  if (isNum(b, 1)) return a;
  if (isNum(a, -1)) return neg(b);
  if (isNum(b, -1)) return neg(a);
  if (isNum(b)) return mul(b, a); // constants first: 2·x
  return { type: 'bin', op: '*', left: a, right: b };
}
export function div(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b) && b.value !== 0) return num(a.value / b.value);
  if (isNum(a, 0)) return num(0);
  if (isNum(b, 1)) return a;
  return { type: 'bin', op: '/', left: a, right: b };
}
export function pow(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b)) return num(Math.pow(a.value, b.value));
  if (isNum(b, 0)) return num(1);
  if (isNum(b, 1)) return a;
  return { type: 'bin', op: '^', left: a, right: b };
}
export function neg(a: Node): Node {
  if (isNum(a)) return num(-a.value);
  if (a.type === 'neg') return a.arg;
  return { type: 'neg', arg: a };
}

/** True if the value of the node changes with x. */
export function dependsOnX(n: Node): boolean {
  switch (n.type) {
    case 'num':
    case 'member':
      return false;
    case 'var':
      // An expression has at most one free variable (x, or the sign chart's / number line's variable).
      return true;
    case 'neg':
      return dependsOnX(n.arg);
    case 'bin':
      return dependsOnX(n.left) || dependsOnX(n.right);
    case 'call':
      return n.args.some(dependsOnX);
  }
}

/**
 * d/dx of a resolved expression, as a new (simplified) expression.
 * Calls to function elements use the chain rule with a higher derivative order:
 * d/dx f(u) = f'(u) · u'. Throws NoSymbolicDerivative for min/max.
 */
export function derive(n: Node): Node {
  if (!dependsOnX(n)) return num(0);
  switch (n.type) {
    case 'num':
    case 'member':
      return num(0);
    case 'var':
      return num(1);
    case 'neg':
      return neg(derive(n.arg));
    case 'bin': {
      const { left: u, right: v } = n;
      switch (n.op) {
        case '+':
          return add(derive(u), derive(v));
        case '-':
          return sub(derive(u), derive(v));
        case '*':
          return add(mul(derive(u), v), mul(u, derive(v)));
        case '/':
          if (!dependsOnX(v)) return div(derive(u), v);
          return div(sub(mul(derive(u), v), mul(u, derive(v))), pow(v, num(2)));
        case '^': {
          if (!dependsOnX(v)) {
            // u^c → c·u^(c−1)·u'
            return mul(mul(v, pow(u, sub(v, num(1)))), derive(u));
          }
          if (!dependsOnX(u)) {
            // c^v → c^v·ln(c)·v'
            return mul(mul(n, call('ln', u)), derive(v));
          }
          // u^v → u^v·(v'·ln u + v·u'/u)
          return mul(n, add(mul(derive(v), call('ln', u)), div(mul(v, derive(u)), u)));
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      if (!n.builtin) {
        const u = n.args[0]!;
        return mul({ type: 'call', fn: n.fn, builtin: false, order: n.order + 1, args: [u] }, derive(u));
      }
      return deriveBuiltin(n.fn, n.args);
    }
  }
}

function deriveBuiltin(fn: string, args: Node[]): Node {
  const u = args[0]!;
  const du = derive(u);
  const chain = (outer: Node) => mul(outer, du);
  const one = num(1);
  switch (fn) {
    case 'sin':
      return chain(call('cos', u));
    case 'cos':
      return chain(neg(call('sin', u)));
    case 'tan':
      return chain(div(one, pow(call('cos', u), num(2))));
    case 'sec':
      return chain(mul(call('sec', u), call('tan', u)));
    case 'csc':
      return chain(neg(mul(call('csc', u), call('cot', u))));
    case 'cot':
      return chain(neg(pow(call('csc', u), num(2))));
    case 'asin':
    case 'arcsin':
      return chain(div(one, call('sqrt', sub(one, pow(u, num(2))))));
    case 'acos':
    case 'arccos':
      return chain(neg(div(one, call('sqrt', sub(one, pow(u, num(2)))))));
    case 'atan':
    case 'arctan':
      return chain(div(one, add(one, pow(u, num(2)))));
    case 'sinh':
      return chain(call('cosh', u));
    case 'cosh':
      return chain(call('sinh', u));
    case 'tanh':
      return chain(sub(one, pow(call('tanh', u), num(2))));
    case 'sqrt':
      return chain(div(one, mul(num(2), call('sqrt', u))));
    case 'cbrt':
      return chain(div(one, mul(num(3), pow(call('cbrt', u), num(2)))));
    case 'exp':
      return chain(call('exp', u));
    case 'ln':
      return chain(div(one, u));
    case 'log': {
      if (args.length === 1) return chain(div(one, mul(u, num(Math.LN10))));
      // log(b, x) = ln(x) / ln(b)
      const [b, x] = args as [Node, Node];
      return derive(div(call('ln', x), call('ln', b)));
    }
    case 'abs':
      return chain(call('sign', u));
    case 'floor':
    case 'ceil':
    case 'round':
    case 'sign':
      return num(0);
    default:
      throw new NoSymbolicDerivative(`${fn}(…)`);
  }
}

/** Apply the simplifying constructors bottom-up (useful for display and tests). */
export function simplify(n: Node): Node {
  switch (n.type) {
    case 'neg':
      return neg(simplify(n.arg));
    case 'bin': {
      const l = simplify(n.left);
      const r = simplify(n.right);
      return n.op === '+' ? add(l, r) : n.op === '-' ? sub(l, r) : n.op === '*' ? mul(l, r) : n.op === '/' ? div(l, r) : pow(l, r);
    }
    case 'call':
      return { ...n, args: n.args.map(simplify) };
    default:
      return n;
  }
}

/**
 * Numeric derivative: central differences with one Richardson step
 * (error ~h⁴). Used where there is no symbolic derivative, and as a test oracle.
 */
export function numericDerivative(f: Fn1, x: number): number {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  const d = (s: number) => (f(x + s) - f(x - s)) / (2 * s);
  return (4 * d(h / 2) - d(h)) / 3;
}
