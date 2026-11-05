import type { Node } from './ast.ts';
import { BUILTIN_FUNCTIONS } from './builtins.ts';

export type Fn1 = (x: number) => number;
/** Looks up a function element by id at call time (so definition order doesn't matter). */
export type FunctionTable = (id: string) => Fn1 | undefined;

/**
 * Compiles a resolved AST into a closure tree once, so sampling a curve at
 * thousands of points doesn't re-walk the AST. No eval / new Function.
 * Domain errors give NaN or ±Infinity rather than throwing; the sampler splits there.
 */
export function compile(node: Node, functions: FunctionTable = () => undefined): Fn1 {
  switch (node.type) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'var':
      return (x) => x;
    case 'neg': {
      const a = compile(node.arg, functions);
      return (x) => -a(x);
    }
    case 'bin': {
      const l = compile(node.left, functions);
      const r = compile(node.right, functions);
      switch (node.op) {
        case '+':
          return (x) => l(x) + r(x);
        case '-':
          return (x) => l(x) - r(x);
        case '*':
          return (x) => l(x) * r(x);
        case '/':
          return (x) => l(x) / r(x);
        case '^':
          return (x) => pow(l(x), r(x));
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      const args = node.args.map((a) => compile(a, functions));
      if (node.builtin) {
        const fn = BUILTIN_FUNCTIONS[node.fn]!.fn;
        if (args.length === 1) {
          const a = args[0]!;
          return (x) => fn(a(x));
        }
        return (x) => fn(...args.map((a) => a(x)));
      }
      const id = node.fn;
      const a = args[0]!;
      return (x) => {
        const f = functions(id);
        return f ? f(a(x)) : NaN;
      };
    }
  }
}

/** Real power: negative base with an odd-denominator rational exponent stays real (cbrt-like, e.g. x^(1/3)). */
function pow(b: number, e: number): number {
  const p = Math.pow(b, e);
  if (!Number.isNaN(p) || b >= 0 || !Number.isFinite(e)) return p;
  // Try e = n/d with small odd d.
  for (let d = 3; d <= 15; d += 2) {
    const n = Math.round(e * d);
    if (Math.abs(n / d - e) < 1e-12) {
      const mag = Math.pow(-b, Math.abs(n) / d);
      const signed = n % 2 === 0 ? mag : -mag;
      return n < 0 ? 1 / signed : signed;
    }
  }
  return p;
}
