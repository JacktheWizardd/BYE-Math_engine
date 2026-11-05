import { describe, expect, it } from 'vitest';
import { compile, derive, numericDerivative, parseExpr, type Fn1, type Scope } from '../src/expr/index.ts';

const X: Scope = { variables: ['x'], functions: [] };
const d = (src: string): Fn1 => compile(derive(parseExpr(src, X)));
const f = (src: string): Fn1 => compile(parseExpr(src, X));

describe('symbolic derivatives: exact cases', () => {
  it.each([
    ['2*x + 1', 5, 2],
    ['x^2', 3, 6],
    ['sin(x)', 0, 1],
    ['x^3 - 2x', 2, 10],
    ['exp(x)', 0, 1],
    ['ln(x)', 4, 0.25],
    ['3', 1, 0],
    ['1/x', 2, -0.25],
  ])('(%s)\' at %d = %d', (src, x, want) => {
    expect(d(src)(x)).toBeCloseTo(want, 12);
  });
});

describe('symbolic vs numeric', () => {
  const cases = [
    'sin(x^2)', 'cos(3x)', 'tan(x)', 'sec(x)', 'csc(x)', 'cot(x)', 'asin(x/4)', 'acos(x/4)', 'atan(x)',
    'sinh(x)', 'cosh(x)', 'tanh(x)', 'sqrt(x^2 + 1)', 'cbrt(x)', 'exp(-x^2)', 'ln(x^2 + 1)', 'log(x + 5)',
    'log(2, x + 5)', 'abs(x - 0.3)', '2^x', 'x^x', '(x+1)(x-1)', 'x sin(x)', '1/(1 + x^2)', 'x^(1/3)',
    'e^(2x)', 'pi x^2', '(x^2+1)/(x-7)', 'sin(x)^2 + cos(x)^2', 'floor(x) + x',
  ];
  const xs = [0.4, 0.9, 1.3, 2.2, 3.1];
  it.each(cases)('%s', (src) => {
    const exact = d(src);
    const fn = f(src);
    for (const x of xs) {
      const want = numericDerivative(fn, x);
      if (!Number.isFinite(want)) continue;
      expect(Math.abs(exact(x) - want)).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
    }
  });
});

describe('element functions (chain rule)', () => {
  it("f(g(x))' = f'(g(x))·g'(x)", () => {
    const scope: Scope = { variables: ['x'], functions: ['f', 'g'] };
    const g = f('x^2');
    const fx = f('sin(x)');
    const nodes: Record<string, ReturnType<typeof parseExpr>> = { f: parseExpr('sin(x)', X), g: parseExpr('x^2', X) };
    const table = (id: string, order: number): Fn1 | undefined => {
      let n = nodes[id];
      if (!n) return undefined;
      for (let k = 0; k < order; k++) n = derive(n);
      return compile(n, table);
    };
    const h = compile(derive(parseExpr('f(g(x))', scope)), table);
    expect(h(1.2)).toBeCloseTo(Math.cos(1.44) * 2.4, 12);
    void g;
    void fx;
  });

  it("parses f'(x) and f''(x)", () => {
    const scope: Scope = { variables: ['x'], functions: ['f'] };
    const n = parseExpr("f''(x) + f'(2)", scope);
    expect(JSON.stringify(n)).toContain('"order":2');
    expect(JSON.stringify(n)).toContain('"order":1');
  });

  it('min/max fall back (throws NoSymbolicDerivative)', () => {
    expect(() => derive(parseExpr('max(x, 1)', X))).toThrow(/No symbolic derivative/);
  });
});

describe('point members', () => {
  it('P.x and P.y read point coordinates', () => {
    const scope: Scope = { variables: [], functions: [], points: ['P'] };
    const v = compile(parseExpr('P.x + 2P.y', scope), undefined, (id) => (id === 'P' ? [3, 4] : undefined));
    expect(v(NaN)).toBe(11);
  });
  it('explains wrong kinds', () => {
    const scope: Scope = { variables: [], functions: ['f'], points: ['P'], others: new Map([['s', 'segment']]) };
    expect(() => parseExpr('s.x', scope)).toThrow(/"s" is a segment, not a point/);
    expect(() => parseExpr('f.x', scope)).toThrow(/"f" is a function, not a point/);
    expect(() => parseExpr('P + 1', scope)).toThrow(/write P.x/);
  });
});
