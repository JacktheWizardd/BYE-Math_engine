import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileExpr, ExprError, parseExpr, type Scope } from '../src/expr';

const X: Scope = { variables: ['x'], functions: [] };
const val = (src: string, x = 0, scope: Scope = X) => compileExpr(src, scope)(x);

describe('precedence', () => {
  it.each([
    ['2*x + 1', 3, 7],
    ['-x^2', 3, -9],
    ['2^3^2', 0, 512],
    ['2^-1', 0, 0.5],
    ['1/2x', 4, 2], // (1/2)*x, documented
    ['(1+2)*3', 0, 9],
    ['10 - 4 - 3', 0, 3],
    ['−x + 1', 2, -1], // unicode minus
    ['2×3÷4', 0, 1.5],
    ['2π', 0, 2 * Math.PI],
  ])('%s at x=%d = %d', (src, x, want) => {
    expect(val(src, x)).toBeCloseTo(want, 12);
  });
});

describe('implicit multiplication', () => {
  it.each([
    ['2x', 3, 6],
    ['3sin(x)', Math.PI / 2, 3],
    ['2(x+1)', 1, 4],
    ['(x+1)(x-1)', 3, 8],
    ['x sin(x)', Math.PI / 2, Math.PI / 2],
    ['x(x+1)', 2, 6],
    ['2pi x', 1, 2 * Math.PI],
    ['2x^2', 3, 18],
    ['-2x', 3, -6],
  ])('%s at x=%d', (src, x, want) => {
    expect(val(src, x)).toBeCloseTo(want, 12);
  });

  it('f(1) is a call when f is a function element', () => {
    const f = compileExpr('2*x + 1', X);
    const g = compileExpr('f(1)', { variables: [], functions: ['f'] }, (id) => (id === 'f' ? f : undefined));
    expect(g(0)).toBe(3);
  });
});

describe('errors', () => {
  const err = (src: string, scope: Scope = X): ExprError => {
    try {
      parseExpr(src, scope);
    } catch (e) {
      expect(e).toBeInstanceOf(ExprError);
      return e as ExprError;
    }
    throw new Error(`expected "${src}" to fail`);
  };

  it('reports position of a syntax error', () => {
    const e = err('2*(x+1');
    expect(e.message).toMatch(/ends too early|Unexpected/);
    const e2 = err('2 * * x');
    expect(e2.start).toBe(4);
  });
  it('suggests x*y for unknown multi-letter names', () => {
    expect(err('xy').message).toContain('x*y');
    expect(err('sinx').message).toContain('sin(x)');
  });
  it('rejects x in constant expressions', () => {
    expect(err('x + 1', { variables: [], functions: [] }).message).toMatch(/constant/);
  });
  it('rejects a bare number after a factor', () => {
    err('(x+1)2');
  });
  it('checks builtin arity', () => {
    expect(err('sin(1, 2)').message).toMatch(/argument/);
  });
  it('requires parens on functions', () => {
    expect(err('sin + 1').message).toMatch(/function/);
  });
  it('rejects empty', () => {
    err('  ');
  });
  it('never uses eval', async () => {
    const fs = await import('node:fs');
    for (const f of ['compile.ts', 'resolve.ts', 'index.ts', 'parser.generated.js']) {
      const src = fs.readFileSync(join(import.meta.dirname, `../src/expr/${f}`), 'utf8');
      expect(src).not.toMatch(/\beval\(|new Function\(/);
    }
  });
});

describe('numeric edge cases', () => {
  it('gives non-finite values instead of throwing', () => {
    expect(val('1/x', 0)).toBe(Infinity);
    expect(Number.isNaN(val('sqrt(x)', -1))).toBe(true);
  });
  it('real cube root of negatives', () => {
    expect(val('x^(1/3)', -8)).toBeCloseTo(-2, 12);
  });
});
