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
/**
 * True if the value changes with the variable `wrt`. Without `wrt`, any free
 * variable counts (single-variable expressions: x, or a sign chart's variable).
 */
export function dependsOn(n: Node, wrt?: string): boolean {
  switch (n.type) {
    case 'num':
    case 'member':
      return false;
    case 'var':
      return wrt === undefined || n.name === wrt;
    case 'neg':
      return dependsOn(n.arg, wrt);
    case 'bin':
      return dependsOn(n.left, wrt) || dependsOn(n.right, wrt);
    case 'call':
      return n.args.some((a) => dependsOn(a, wrt));
  }
}

/** True if a single-variable expression depends on its variable. */
export const dependsOnX = (n: Node): boolean => dependsOn(n);

/**
 * Derivative of a resolved expression, as a new (simplified) expression.
 * `wrt` names the variable (partial derivative; other variables held constant);
 * without it, the expression's single variable.
 * Function elements use the chain rule: d/dx f(u) = f'(u)·u', and for a
 * two-variable f: d/dw f(u, v) = f_x(u, v)·u' + f_y(u, v)·v'.
 * Throws NoSymbolicDerivative for min/max.
 */
export function derive(n: Node, wrt?: string): Node {
  const d = (m: Node) => derive(m, wrt);
  const dep = (m: Node) => dependsOn(m, wrt);
  if (!dep(n)) return num(0);
  switch (n.type) {
    case 'num':
    case 'member':
      return num(0);
    case 'var':
      return num(wrt === undefined || n.name === wrt ? 1 : 0);
    case 'neg':
      return neg(d(n.arg));
    case 'bin': {
      const { left: u, right: v } = n;
      switch (n.op) {
        case '+':
          return add(d(u), d(v));
        case '-':
          return sub(d(u), d(v));
        case '*':
          return add(mul(d(u), v), mul(u, d(v)));
        case '/':
          if (!dep(v)) return div(d(u), v);
          return div(sub(mul(d(u), v), mul(u, d(v))), pow(v, num(2)));
        case '^': {
          if (!dep(v)) {
            // u^c → c·u^(c−1)·u'
            return mul(mul(v, pow(u, sub(v, num(1)))), d(u));
          }
          if (!dep(u)) {
            // c^v → c^v·ln(c)·v'
            return mul(mul(n, call('ln', u)), d(v));
          }
          // u^v → u^v·(v'·ln u + v·u'/u)
          return mul(n, add(mul(d(v), call('ln', u)), div(mul(v, d(u)), u)));
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      if (!n.builtin) {
        if (n.args.length === 2) {
          const [u, v] = n.args as [Node, Node];
          const p = n.partial ?? '';
          const fx: Node = { type: 'call', fn: n.fn, builtin: false, order: 0, partial: `${p}x`, args: [u, v] };
          const fy: Node = { type: 'call', fn: n.fn, builtin: false, order: 0, partial: `${p}y`, args: [u, v] };
          return add(mul(fx, d(u)), mul(fy, d(v)));
        }
        const u = n.args[0]!;
        return mul({ type: 'call', fn: n.fn, builtin: false, order: n.order + 1, args: [u] }, d(u));
      }
      return deriveBuiltin(n.fn, n.args, wrt);
    }
  }
}

function deriveBuiltin(fn: string, args: Node[], wrt?: string): Node {
  const u = args[0]!;
  const du = derive(u, wrt);
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
      return derive(div(call('ln', x), call('ln', b)), wrt);
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
