import type { Fn1 } from '../expr/index.ts';
import { scale, type Range, type Viewport } from './view.ts';

/** A curve as one or more unbroken runs of math points [x, y]. */
export type Polyline = [number, number][];

export interface SampleOptions {
  /** x values that must be sample points (region bounds, marked points, label anchors). */
  breakpoints?: readonly number[];
  /** Initial uniform intervals. */
  initial?: number;
  /** Subdivisions always made below the initial grid. */
  minDepth?: number;
  /** Maximum adaptive subdivisions per initial interval. */
  maxDepth?: number;
  /** Max distance (px) between the true midpoint and the chord midpoint before splitting. */
  tolerance?: number;
}

const isFin = Number.isFinite;

/**
 * Adaptive sampling of y = f(x) over [a, b] (already clipped to the view).
 * Denser where the curve bends (measured in pixels), and split into separate
 * runs at non-finite values (1/x at 0, sqrt below 0) and at jumps
 * (tan at π/2, floor), so no line is drawn across a gap or asymptote.
 */
export function sampleFunction(f: Fn1, [a, b]: Range, vp: Viewport, opts: SampleOptions = {}): Polyline[] {
  const { initial = 64, minDepth = 1, maxDepth = 14, tolerance = 0.2 } = opts;
  const [sx, sy] = scale(vp);
  const yLo = vp.y[0];
  const yHi = vp.y[1];
  const ySpan = yHi - yLo;
  const pxY = (y: number) => y * sy;
  const pxX = (x: number) => x * sx;

  // Grid nodes: uniform plus breakpoints inside (a, b).
  const nodes = new Set<number>();
  for (let i = 0; i <= initial; i++) nodes.add(i === initial ? b : a + ((b - a) * i) / initial);
  for (const p of opts.breakpoints ?? []) if (p > a && p < b) nodes.add(p);
  const xs = [...nodes].sort((u, v) => u - v);

  const runs: Polyline[] = [];
  let run: Polyline = [];
  const push = (x: number, y: number) => {
    const last = run[run.length - 1];
    if (last && last[0] === x) return;
    run.push([x, y]);
  };
  const breakRun = () => {
    if (run.length >= 2) runs.push(run);
    else if (run.length === 1) runs.push(run); // isolated point; renderer may skip
    run = [];
  };

  const farOutside = (y0: number, ym: number, y1: number) =>
    (y0 > yHi + ySpan && ym > yHi + ySpan && y1 > yHi + ySpan) || (y0 < yLo - ySpan && ym < yLo - ySpan && y1 < yLo - ySpan);

  /** Bisect toward the last finite point next to a non-finite one. */
  const domainEdge = (xGood: number, xBad: number): [number, number] | null => {
    let g = xGood;
    let bad = xBad;
    let gy = f(g);
    for (let i = 0; i < 52; i++) {
      const m = (g + bad) / 2;
      const ym = f(m);
      if (isFin(ym)) {
        g = m;
        gy = ym;
      } else bad = m;
    }
    return g !== xGood && isFin(gy) ? [g, gy] : null;
  };

  /** True if the values jump between x0 and x1 (don't converge as the interval shrinks). */
  const isJump = (x0: number, y0: number, x1: number, y1: number): boolean => {
    let l = x0, ly = y0, r = x1, ry = y1;
    for (let i = 0; i < 60; i++) {
      const m = (l + r) / 2;
      if (m === l || m === r) break;
      const my = f(m);
      if (!isFin(my)) return true;
      if (Math.abs(my - ly) >= Math.abs(ry - my)) {
        r = m;
        ry = my;
      } else {
        l = m;
        ly = my;
      }
    }
    return Math.abs(pxY(ry - ly)) > 1;
  };

  const refine = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const f0 = isFin(y0);
    const f1 = isFin(y1);
    if (!f0 && !f1) {
      if (depth < minDepth + 2) {
        const xm = (x0 + x1) / 2;
        const ym = f(xm);
        refine(x0, y0, xm, ym, depth + 1);
        refine(xm, ym, x1, y1, depth + 1);
      }
      return;
    }
    if (f0 !== f1) {
      // Crossing a domain edge (or a pole): find it, end or start a run there.
      // Keep refining up to the edge so the curve's approach is drawn accurately.
      if (f0) {
        const edge = domainEdge(x0, x1);
        if (edge) refine(x0, y0, edge[0], edge[1], depth + 1);
        breakRun();
      } else {
        const edge = domainEdge(x1, x0);
        if (edge) {
          push(edge[0], edge[1]);
          refine(edge[0], edge[1], x1, y1, depth + 1);
        } else push(x1, y1);
      }
      return;
    }
    const xm = (x0 + x1) / 2;
    const ym = f(xm);
    if (!isFin(ym)) {
      refine(x0, y0, xm, ym, depth + 1);
      refine(xm, ym, x1, y1, depth + 1);
      return;
    }
    const dev = Math.abs(pxY(ym - (y0 + y1) / 2));
    const flat = dev <= tolerance || farOutside(y0, ym, y1);
    if (depth >= minDepth && flat) {
      push(xm, ym);
      push(x1, y1);
      return;
    }
    if (depth >= maxDepth || pxX(x1 - x0) < 1e-3) {
      if (isJump(x0, y0, x1, y1)) {
        breakRun();
        push(x1, y1);
      } else {
        push(xm, ym);
        push(x1, y1);
      }
      return;
    }
    refine(x0, y0, xm, ym, depth + 1);
    refine(xm, ym, x1, y1, depth + 1);
  };

  let prevX = xs[0]!;
  let prevY = f(prevX);
  if (isFin(prevY)) push(prevX, prevY);
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i]!;
    const y = f(x);
    refine(prevX, prevY, x, y, 0);
    prevX = x;
    prevY = y;
  }
  breakRun();
  return runs.filter((r) => r.length >= 2);
}

/** Points of the sampled curve with from ≤ x ≤ to, in order. Assumes from/to were breakpoints. */
export function slice(runs: readonly Polyline[], from: number, to: number): Polyline[] {
  const out: Polyline[] = [];
  for (const r of runs) {
    const part = r.filter(([x]) => x >= from && x <= to);
    if (part.length) out.push(part);
  }
  return out;
}
