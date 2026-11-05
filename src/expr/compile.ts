import type { Node } from './ast.ts';
import { BUILTIN_FUNCTIONS } from './builtins.ts';

export type Fn1 = (x: number) => number;
/** A compiled expression in up to three variables (x | t | u, then y | v, then z). */
export type FnN = (a: number, b?: number, c?: number) => number;
/** A compiled two-variable function. */
export type Fn2 = (x: number, y: number) => number;
/**
 * Looks up a function element by id at call time (so definition order doesn't matter).
 * `order` is the derivative order: 0 for f, 1 for f', 2 for f''.
 */
export type FunctionTable = (id: string, order: number) => Fn1 | undefined;
/** Looks up a two-variable function element; `partial` is "" for f, "x" for f_x, "xy" for f_xy… */
export type Function2Table = (id: string, partial: string) => Fn2 | undefined;
/** Looks up a point element's coordinates at call time. */
export type PointTable = (id: string) => readonly number[] | undefined;

export interface CompileOptions {
  /** Variable names in argument order, e.g. ["x", "y"] or ["u", "v"]. Default: the single variable. */
  vars?: readonly string[];
  functions2?: Function2Table;
}

/**
 * Compiles a resolved AST into a closure tree once, so sampling a curve or a
 * surface doesn't re-walk the AST. No eval / new Function.
 * Domain errors give NaN or ±Infinity rather than throwing; samplers split there.
 */
export function compile(node: Node, functions: FunctionTable = () => undefined, points: PointTable = () => undefined, opts: CompileOptions = {}): FnN {
  const rec = (n: Node) => compile(n, functions, points, opts);
  switch (node.type) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'var': {
      const i = opts.vars ? Math.max(0, opts.vars.indexOf(node.name)) : 0;
      return i === 0 ? (a) => a : i === 1 ? (_a, b) => b ?? NaN : (_a, _b, c) => c ?? NaN;
    }
    case 'neg': {
      const a = rec(node.arg);
      return (x, y, z) => -a(x, y, z);
    }
    case 'bin': {
      const l = rec(node.left);
      const r = rec(node.right);
      switch (node.op) {
        case '+':
          return (x, y, z) => l(x, y, z) + r(x, y, z);
        case '-':
          return (x, y, z) => l(x, y, z) - r(x, y, z);
        case '*':
          return (x, y, z) => l(x, y, z) * r(x, y, z);
        case '/':
          return (x, y, z) => l(x, y, z) / r(x, y, z);
        case '^':
          return (x, y, z) => pow(l(x, y, z), r(x, y, z));
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      const args = node.args.map(rec);
      if (node.builtin) {
        const fn = BUILTIN_FUNCTIONS[node.fn]!.fn;
        if (args.length === 1) {
          const a = args[0]!;
          return (x, y, z) => fn(a(x, y, z));
        }
        return (x, y, z) => fn(...args.map((a) => a(x, y, z)));
      }
      const id = node.fn;
      if (args.length === 2) {
        const partial = node.partial ?? '';
        const [a, b] = args as [FnN, FnN];
        const f2 = opts.functions2 ?? (() => undefined);
        return (x, y, z) => {
          const f = f2(id, partial);
          return f ? f(a(x, y, z), b(x, y, z)) : NaN;
        };
      }
      const order = node.order;
      const a = args[0]!;
      return (x, y, z) => {
        const f = functions(id, order);
        return f ? f(a(x, y, z)) : NaN;
      };
    }
    case 'member': {
      const { id, axis } = node;
      const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      return () => points(id)?.[k] ?? NaN;
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
