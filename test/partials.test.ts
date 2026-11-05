import { describe, expect, it } from 'vitest';
import { compile, derive, parseExpr, type Fn2, type Node } from '../src/expr/index.ts';

const XY = { variables: ['x', 'y'], functions: [] as string[] };
const opts = { vars: ['x', 'y'] };
const fn = (n: Node) => compile(n, undefined, undefined, opts) as (x: number, y: number) => number;
const num = (f: (x: number, y: number) => number, x: number, y: number, w: 'x' | 'y') => {
  const h = 1e-5;
  return w === 'x' ? (f(x + h, y) - f(x - h, y)) / (2 * h) : (f(x, y + h) - f(x, y - h)) / (2 * h);
};

describe('partial derivatives', () => {
  const cases = [
    'x^2 - y^2', 'x y', 'sin(x) cos(y)', 'exp(-(x^2 + y^2))', 'sqrt(x^2 + y^2 + 1)', 'ln(x^2 + y^2 + 1)',
    'x^3 y^2', 'x / (1 + y^2)', 'atan(y / (x + 3))', '4 - x^2 - y^2', '(x - y)^3', 'x e^(x y)',
    'sin(x y)', 'cos(x + 2y)', 'x^y', 'tanh(x - y)', 'abs(x) + y', '3x + 2y + 1', 'y^2 sin(x)', '1/(x^2 + y^2 + 1)',
  ];
  const pts: [number, number][] = [[0.7, 0.3], [1.2, -0.8], [0.4, 1.5]];
  it.each(cases)('%s', (src) => {
    const n = parseExpr(src, XY);
    const f = fn(n);
    for (const w of ['x', 'y'] as const) {
      const d = fn(derive(n, w));
      for (const [x, y] of pts) {
        const want = num(f, x, y, w);
        expect(Math.abs(d(x, y) - want)).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
      }
    }
  });

  it('holds the other variable constant', () => {
    const n = parseExpr('x^2 y^3', XY);
    expect(fn(derive(n, 'x'))(2, 3)).toBe(2 * 2 * 27);
    expect(fn(derive(n, 'y'))(2, 3)).toBe(4 * 3 * 9);
  });

  it('f(a, b), f_x and f_xy for a surface element', () => {
    const scope = { variables: ['x', 'y'], functions: [], functions2: ['f'] };
    const fNode = parseExpr('x^2 y + y^3', XY);
    const table = (id: string, partial: string): Fn2 | undefined => {
      if (id !== 'f') return undefined;
      let n = fNode;
      for (const c of partial) n = derive(n, c);
      return fn(n);
    };
    const v = (src: string) => compile(parseExpr(src, scope), undefined, undefined, { vars: ['x', 'y'], functions2: table })(0, 0);
    expect(v('f(1, 2)')).toBe(10);
    expect(v('f_x(1, 2)')).toBe(4);
    expect(v('f_y(1, 2)')).toBe(1 + 12);
    expect(v('f_xy(1, 2)')).toBe(2);
    // chain rule through a two-variable call
    const g = compile(derive(parseExpr('f(x, 2x)', scope), 'x'), undefined, undefined, { vars: ['x', 'y'], functions2: table });
    expect(g(1)).toBeCloseTo(4 * 1 + 13 * 2 /* f_x + 2 f_y at (1, 2) */, 12);
    expect(() => parseExpr("f'(1, 2)", scope)).toThrow(/partial derivatives as f_x/);
    expect(() => parseExpr('f(1)', scope)).toThrow(/takes 2 arguments/);
  });

  it('P.z', () => {
    const v = compile(parseExpr('P.z + 1', { variables: [], functions: [], points: ['P'] }), undefined, (id) => (id === 'P' ? [1, 2, 3] : undefined));
    expect(v(0)).toBe(4);
  });
});
