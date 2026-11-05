import type { Fn1 } from '../expr/index.ts';

/** Definite integral of f over [a, b] by adaptive Simpson's rule. Returns NaN if f isn't finite on [a, b]. */
export function integrate(f: Fn1, a: number, b: number, tol = 1e-10, maxDepth = 50): number {
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, tol, maxDepth);
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  const simpson = (l: number, r: number, fl: number, fmid: number, fr: number) => ((r - l) / 6) * (fl + 4 * fmid + fr);
  const rec = (l: number, r: number, fl: number, fmid: number, fr: number, whole: number, eps: number, depth: number): number => {
    const mid = (l + r) / 2;
    const lm = (l + mid) / 2;
    const rm = (mid + r) / 2;
    const flm = f(lm);
    const frm = f(rm);
    const left = simpson(l, mid, fl, flm, fmid);
    const right = simpson(mid, r, fmid, frm, fr);
    const delta = left + right - whole;
    if (!Number.isFinite(delta)) return NaN;
    if (depth <= 0 || Math.abs(delta) <= 15 * eps) return left + right + delta / 15;
    return rec(l, mid, fl, flm, fmid, left, eps / 2, depth - 1) + rec(mid, r, fmid, frm, fr, right, eps / 2, depth - 1);
  };
  return rec(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), tol, maxDepth);
}

/** Roots of f on [a, b]: sign changes on a grid, refined by bisection. */
export function findRoots(f: Fn1, a: number, b: number, grid = 512): number[] {
  const roots: number[] = [];
  const add = (r: number) => {
    if (!roots.some((q) => Math.abs(q - r) < 1e-9 * Math.max(1, Math.abs(r)))) roots.push(r);
  };
  let x0 = a;
  let y0 = f(x0);
  if (y0 === 0) add(x0);
  for (let i = 1; i <= grid; i++) {
    const x1 = a + ((b - a) * i) / grid;
    const y1 = f(x1);
    if (y1 === 0) add(x1);
    else if (Number.isFinite(y0) && Number.isFinite(y1) && y0 !== 0 && Math.sign(y0) !== Math.sign(y1)) {
      let l = x0, r = x1, fl = y0;
      for (let k = 0; k < 80; k++) {
        const m = (l + r) / 2;
        const fm = f(m);
        if (!Number.isFinite(fm)) break;
        if (fm === 0) {
          l = r = m;
          break;
        }
        if (Math.sign(fm) === Math.sign(fl)) {
          l = m;
          fl = fm;
        } else r = m;
      }
      const root = (l + r) / 2;
      // A sign change across a pole (1/x) is not a root.
      if (Math.abs(f(root)) < 1e-6) add(root);
    }
    x0 = x1;
    y0 = y1;
  }
  return roots.sort((p, q) => p - q);
}

/** Intersections of f and g on [a, b]. */
export function intersections(f: Fn1, g: Fn1, a: number, b: number): [number, number][] {
  return findRoots((x) => f(x) - g(x), a, b).map((x) => [x, f(x)]);
}
