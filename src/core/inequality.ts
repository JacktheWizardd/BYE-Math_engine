import { ExprError, parseExpr, dependsOnX, type FunctionTable, type Node } from '../expr/index.ts';
import { analyzeSign, SignError } from './sign.ts';

/** A piece of a solution set. `from === to` for an isolated point. Ends may be ±Infinity (never closed). */
export interface SetInterval {
  from: number;
  to: number;
  closedFrom: boolean;
  closedTo: boolean;
}

export type SolutionSet = SetInterval[];

type Op = '<' | '<=' | '>' | '>=' | '=' | '!=';

const contains = (s: SolutionSet, x: number) =>
  s.some((p) => (x > p.from && x < p.to) || (x === p.from && p.closedFrom) || (x === p.to && p.closedTo));

/**
 * Rebuilds a set from a membership test that is constant between the given breakpoints:
 * each breakpoint and each gap between them is tested once, then runs are merged.
 */
function fromMembership(breaks: number[], member: (x: number) => boolean): SolutionSet {
  const bs = [...new Set(breaks.filter(Number.isFinite))].sort((p, q) => p - q);
  type Piece = { from: number; to: number; isPoint: boolean };
  const pieces: Piece[] = [];
  const gapRep = (lo: number, hi: number) => (lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2);
  const edges = [-Infinity, ...bs, Infinity];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    if (i > 0) pieces.push({ from: lo, to: lo, isPoint: true });
    pieces.push({ from: lo, to: hi, isPoint: false });
  }
  const out: SolutionSet = [];
  let cur: SetInterval | null = null;
  for (const p of pieces) {
    const inside = member(p.isPoint ? p.from : gapRep(p.from, p.to));
    if (inside) {
      if (!cur) cur = { from: p.from, to: p.to, closedFrom: p.isPoint, closedTo: p.isPoint };
      else {
        cur.to = p.to;
        cur.closedTo = p.isPoint;
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const breaksOf = (s: SolutionSet) => s.flatMap((p) => [p.from, p.to]);

export const union = (a: SolutionSet, b: SolutionSet) => fromMembership([...breaksOf(a), ...breaksOf(b)], (x) => contains(a, x) || contains(b, x));
export const intersect = (a: SolutionSet, b: SolutionSet) => fromMembership([...breaksOf(a), ...breaksOf(b)], (x) => contains(a, x) && contains(b, x));

/** Where `node` (an expression in the variable) satisfies `node op 0`. */
export function solveSign(node: Node, op: Op, range: readonly [number, number], table?: FunctionTable): SolutionSet {
  const { points, intervals } = analyzeSign(node, table, range);
  const wantSign = op === '<' || op === '<=' ? -1 : op === '>' || op === '>=' ? 1 : null;
  const withZero = op === '<=' || op === '>=' || op === '=';
  const member = (x: number): boolean => {
    const pt = points.find((p) => p.x === x);
    if (pt) return pt.value === 'zero' && withZero;
    const iv = intervals.find((i) => x > i.from && x < i.to);
    if (!iv || iv.sign === null) return false;
    if (op === '!=') return iv.sign !== 0;
    if (iv.sign === 0) return withZero;
    return iv.sign === wantSign;
  };
  return fromMembership(points.map((p) => p.x), member);
}

const OPS: [string, Op][] = [
  ['<=', '<='], ['>=', '>='], ['!=', '!='], ['==', '='], ['=<', '<='], ['=>', '>='],
  ['≤', '<='], ['≥', '>='], ['≠', '!='], ['<', '<'], ['>', '>'], ['=', '='],
];

/** Splits at top-level separators (outside parentheses), keeping offsets. */
function splitTop(src: string, start: number, end: number, seps: RegExp): [number, number][] {
  const parts: [number, number][] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < end; i++) {
    const c = src[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0) {
      seps.lastIndex = i;
      const m = seps.exec(src);
      if (m && m.index === i) {
        parts.push([from, i]);
        i += m[0].length - 1;
        from = i + 1;
      }
    }
  }
  parts.push([from, end]);
  return parts;
}

/**
 * Solves an inequality written for a student: chains (`-1 < x <= 3`), `and`, `or`,
 * `!=`, `=`, and any expression on either side (`x^2 - 4 > 0`, `(x-1)/(x+2) >= 0`).
 * Each comparison L op R becomes the sign condition of L − R. Throws ExprError
 * (with the position in the original string) or SignError.
 */
export function solveInequality(src: string, variable: string, range: readonly [number, number], functions: string[] = [], table?: FunctionTable): SolutionSet {
  const scope = { variables: [variable], functions };
  const sub = (from: number, to: number): Node => {
    const text = src.slice(from, to);
    if (!text.trim()) throw new ExprError('Missing expression', src, from, Math.max(from + 1, to));
    try {
      return parseExpr(text, scope);
    } catch (e) {
      if (e instanceof ExprError) throw new ExprError(e.message, src, from + e.start, from + e.end);
      throw e;
    }
  };

  const orParts = splitTop(src, 0, src.length, /\s+or\s+|∪|\|\|/y);
  let result: SolutionSet = [];
  for (const [os, oe] of orParts) {
    let conj: SolutionSet | null = null;
    for (const [as, ae] of splitTop(src, os, oe, /\s+and\s+|∧|&&|,/y)) {
      // chain: e0 op0 e1 op1 e2 …
      const sides: [number, number][] = [];
      const ops: Op[] = [];
      let depth = 0;
      let from = as;
      for (let i = as; i < ae; i++) {
        const c = src[i]!;
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0) {
          const hit = OPS.find(([t]) => src.startsWith(t, i));
          if (hit) {
            sides.push([from, i]);
            ops.push(hit[1]);
            i += hit[0].length - 1;
            from = i + 1;
          }
        }
      }
      sides.push([from, ae]);
      if (ops.length === 0) throw new ExprError(`Expected a comparison like ${variable} < 3`, src, as, Math.max(as + 1, ae));
      const nodes = sides.map(([s, e]) => sub(s, e));
      if (!nodes.some(dependsOnX)) throw new ExprError(`This doesn't involve ${variable}`, src, as, ae);
      for (let k = 0; k < ops.length; k++) {
        const diff: Node = { type: 'bin', op: '-', left: nodes[k]!, right: nodes[k + 1]! };
        const s = solveSign(diff, ops[k]!, range, table);
        conj = conj === null ? s : intersect(conj, s);
      }
    }
    result = union(result, conj ?? []);
  }
  return result;
}

export { SignError };
