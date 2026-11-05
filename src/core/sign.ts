import { compile, type Fn1, type FunctionTable, type Node } from '../expr/index.ts';
import { snap } from './format.ts';
import { findRoots } from './solve.ts';

/** +1, −1, 0 (identically zero) or null (undefined throughout). */
export type Sign = 1 | -1 | 0 | null;

export interface CriticalPoint {
  x: number;
  /** f(x) = 0, or f is undefined at x (pole, hole, domain edge). */
  value: 'zero' | 'undefined';
}

export interface SignInterval {
  /** May be −Infinity / Infinity. */
  from: number;
  to: number;
  sign: Sign;
}

export interface SignAnalysis {
  points: CriticalPoint[];
  /** points.length + 1 intervals, from −∞ to +∞. */
  intervals: SignInterval[];
}

/** The sign of an expression couldn't be determined reliably (reported as a validation error). */
export class SignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignError';
  }
}

const num = (value: number): Node => ({ type: 'num', value });
const call = (fn: string, arg: Node): Node => ({ type: 'call', fn, builtin: true, order: 0, args: [arg] });

/** Sub-expressions whose zeros can make the whole expression undefined (denominators, sqrt/ln arguments, …). */
function domainLimits(n: Node, out: Node[] = []): Node[] {
  switch (n.type) {
    case 'neg':
      domainLimits(n.arg, out);
      break;
    case 'bin':
      if (n.op === '/') out.push(n.right);
      if (n.op === '^' && !(n.right.type === 'num' && Number.isInteger(n.right.value) && n.right.value >= 0)) out.push(n.left);
      domainLimits(n.left, out);
      domainLimits(n.right, out);
      break;
    case 'call':
      if (n.builtin) {
        const u = n.args[n.args.length - 1]!;
        if (['sqrt', 'ln', 'log'].includes(n.fn)) out.push(u);
        if (n.fn === 'log' && n.args.length === 2) out.push(n.args[0]!);
        if (n.fn === 'tan' || n.fn === 'sec') out.push(call('cos', u));
        if (n.fn === 'cot' || n.fn === 'csc') out.push(call('sin', u));
        if (['asin', 'acos', 'arcsin', 'arccos'].includes(n.fn)) {
          out.push({ type: 'bin', op: '-', left: num(1), right: u }, { type: 'bin', op: '+', left: num(1), right: u });
        }
      }
      n.args.forEach((a) => domainLimits(a, out));
      break;
  }
  return out;
}

/**
 * Where an expression is zero or undefined, and its sign in between.
 * Critical points come from the zeros of f, the zeros of every denominator and
 * domain-limiting argument, and a numeric scan for sign changes and where f stops
 * being defined. Each interval's sign is checked at several points.
 */
export function analyzeSign(node: Node, table: FunctionTable | undefined, range: readonly [number, number]): SignAnalysis {
  const [a, b] = range;
  const f: Fn1 = compile(node, table);
  const candidates: number[] = [];

  // zeros of f (incl. touching roots)
  candidates.push(...findRoots(f, a, b, 2048));
  // zeros of denominators / arguments
  for (const g of domainLimits(node)) candidates.push(...findRoots(compile(g, table), a, b, 2048));
  // numeric scan: defined ↔ undefined edges, and sign changes (poles, jumps)
  const N = 4096;
  let x0 = a;
  let y0 = f(x0);
  for (let i = 1; i <= N; i++) {
    const x1 = a + ((b - a) * i) / N;
    const y1 = f(x1);
    const fin0 = Number.isFinite(y0);
    const fin1 = Number.isFinite(y1);
    if (fin0 !== fin1 || (fin0 && fin1 && y0 !== 0 && y1 !== 0 && Math.sign(y0) !== Math.sign(y1))) {
      let l = x0, r = x1, yl = y0;
      for (let k = 0; k < 70; k++) {
        const m = (l + r) / 2;
        const ym = f(m);
        const same = fin0 !== fin1 ? Number.isFinite(ym) === Number.isFinite(yl) : Math.sign(ym) === Math.sign(yl);
        if (same) {
          l = m;
          yl = ym;
        } else r = m;
      }
      candidates.push((l + r) / 2);
    }
    x0 = x1;
    y0 = y1;
  }

  // merge, snap to simple fractions, classify
  const sorted = candidates.filter(Number.isFinite).map(snap).sort((p, q) => p - q);
  const merged: number[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || Math.abs(c - last) > 1e-7 * Math.max(1, Math.abs(c))) merged.push(c);
  }
  const points: CriticalPoint[] = [];
  for (const c of merged) {
    const v = f(c);
    if (!Number.isFinite(v)) points.push({ x: c, value: 'undefined' });
    else if (Math.abs(v) < 1e-8) points.push({ x: c, value: 'zero' });
    else {
      // A sign change with no zero and a finite value: a jump (e.g. sign(x) at a point it's defined) — treat as undefined only if the sign really flips.
      const h = 1e-7 * Math.max(1, Math.abs(c));
      const l = f(c - h);
      const r = f(c + h);
      if (Number.isFinite(l) && Number.isFinite(r) && Math.sign(l) !== Math.sign(r) && l !== 0 && r !== 0) points.push({ x: c, value: 'undefined' });
    }
  }

  // sign on each interval
  const edges = [-Infinity, ...points.map((p) => p.x), Infinity];
  const intervals: SignInterval[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const sLo = lo === -Infinity ? Math.min(a, hi - 1) : lo;
    const sHi = hi === Infinity ? Math.max(b, lo + 1) : hi;
    const signs = new Set<Sign | 'nan'>();
    for (let k = 1; k <= 11; k++) {
      const x = sLo + ((sHi - sLo) * k) / 12;
      const v = f(x);
      signs.add(!Number.isFinite(v) ? 'nan' : v > 0 ? 1 : v < 0 ? -1 : 0);
    }
    const nonZero = [...signs].filter((s) => s !== 0);
    let sign: Sign;
    if (signs.size === 1 && signs.has(0)) sign = 0;
    else if (nonZero.length === 1) sign = nonZero[0] === 'nan' ? null : (nonZero[0] as 1 | -1);
    else if (nonZero.includes('nan')) {
      throw new SignError(`the expression is defined on only part of (${fmt(lo)}, ${fmt(hi)})`);
    } else {
      throw new SignError(`the sign changes between ${fmt(lo)} and ${fmt(hi)} without a zero or a break; widen or narrow "range"`);
    }
    intervals.push({ from: lo, to: hi, sign });
  }
  return { points, intervals };
}

const fmt = (x: number) => (x === Infinity ? '∞' : x === -Infinity ? '−∞' : String(+x.toFixed(4)));
