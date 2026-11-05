import { describe, expect, it } from 'vitest';
import { analyzeSign, formatValue, solveInequality, type SolutionSet } from '../src/core/index.ts';
import { parseExpr, parseRaw, toTex } from '../src/expr/index.ts';

const R: [number, number] = [-50, 50];
const sign = (src: string) => analyzeSign(parseExpr(src, { variables: ['x'], functions: [] }), undefined, R);
const solve = (src: string) => solveInequality(src, 'x', R);
const show = (s: SolutionSet) =>
  s
    .map((p) =>
      p.from === p.to
        ? `{${p.from}}`
        : `${p.closedFrom ? '[' : '('}${p.from === -Infinity ? '-inf' : +p.from.toFixed(9)}, ${p.to === Infinity ? 'inf' : +p.to.toFixed(9)}${p.closedTo ? ']' : ')'}`,
    )
    .join(' u ');

describe('sign analysis', () => {
  it('rational function with a pole', () => {
    const a = sign('(x-1)(x+2)/(x-3)');
    expect(a.points).toEqual([
      { x: -2, value: 'zero' },
      { x: 1, value: 'zero' },
      { x: 3, value: 'undefined' },
    ]);
    expect(a.intervals.map((i) => i.sign)).toEqual([-1, 1, -1, 1]);
  });

  it('sqrt domain edge: undefined to the left, zero at the edge', () => {
    const a = sign('sqrt(x - 1)');
    expect(a.points).toEqual([{ x: 1, value: 'zero' }]);
    expect(a.intervals.map((i) => i.sign)).toEqual([null, 1]);
  });

  it('touching root keeps its sign', () => {
    const a = sign('(x-1)^2');
    expect(a.points).toEqual([{ x: 1, value: 'zero' }]);
    expect(a.intervals.map((i) => i.sign)).toEqual([1, 1]);
  });

  it('fractions are exact', () => {
    const a = sign('2x - 1');
    expect(a.points[0]!.x).toBe(0.5);
    expect(formatValue(0.5).text).toBe('1/2');
    expect(formatValue(-2).text).toBe('−2');
  });

  it('ln: undefined up to 0, zero at 1', () => {
    const a = sign('ln(x)');
    expect(a.points).toEqual([
      { x: 0, value: 'undefined' },
      { x: 1, value: 'zero' },
    ]);
    expect(a.intervals.map((i) => i.sign)).toEqual([null, -1, 1]);
  });
});

describe('inequalities', () => {
  it.each([
    ['-1 < x <= 3', '(-1, 3]'],
    ['x < 0 or x >= 2', '(-inf, 0) u [2, inf)'],
    ['x^2 < 4', '(-2, 2)'],
    ['x^2 - 4 > 0', '(-inf, -2) u (2, inf)'],
    ['x != 1', '(-inf, 1) u (1, inf)'],
    ['x = 2', '{2}'],
    ['(x-1)/(x+2) >= 0', '(-inf, -2) u [1, inf)'],
    ['x ≥ -1 and x < 4', '[-1, 4)'],
    ['2x + 1 <= 5', '(-inf, 2]'],
    ['3 > x', '(-inf, 3)'],
    ['(x-1)^2 <= 0', '{1}'],
    ['x^2 + 1 < 0', ''],
  ])('%s → %s', (src, want) => {
    expect(show(solve(src))).toBe(want);
  });

  it('errors carry the position in the original string', () => {
    try {
      solve('-1 < x <= 3 +');
      throw new Error('no error');
    } catch (e) {
      const err = e as { start: number; message: string };
      expect(err.message).toMatch(/ends too early|Unexpected/);
      expect(err.start).toBeGreaterThanOrEqual(10);
    }
    expect(() => solve('x + 1')).toThrow(/Expected a comparison/);
    expect(() => solve('2 < 3')).toThrow(/doesn't involve x/);
  });
});

describe('toTex', () => {
  it.each([
    ['(x-1)(x+2)/(x-3)', '\\frac{\\left(x - 1\\right)\\left(x + 2\\right)}{x - 3}'],
    ['x^2 - 4', '{x}^{2} - 4'],
    ['2x + 1', '2x + 1'],
    ["f'(x)", "f'\\left(x\\right)"],
    ['sqrt(x - 1)', '\\sqrt{x - 1}'],
    ['3sin(x)', '3 \\sin\\left(x\\right)'],
  ])('%s', (src, want) => {
    expect(toTex(parseRaw(src))).toBe(want);
  });
});
