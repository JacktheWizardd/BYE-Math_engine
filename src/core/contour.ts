/** Level curves f(x, y) = c by marching squares, with each point refined onto the curve. */

export type Fxy = (x: number, y: number) => number;
export type Pt2 = [number, number];

export interface ContourLevel {
  level: number;
  /** Polylines (closed ones repeat their first point at the end). */
  lines: Pt2[][];
}

/** Values of f on an (n+1)×(n+1) grid over the box. */
export function sampleGrid(f: Fxy, [x0, x1]: readonly [number, number], [y0, y1]: readonly [number, number], n: number) {
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  const ys = Array.from({ length: n + 1 }, (_, j) => y0 + ((y1 - y0) * j) / n);
  const v = ys.map((y) => xs.map((x) => f(x, y)));
  return { xs, ys, v };
}

/** Round levels between the smallest and largest value of f in the box (ends excluded). */
export function autoLevels(values: number[][], count: number): number[] {
  const flat = values.flat().filter(Number.isFinite);
  if (!flat.length) return [];
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  if (lo === hi) return [];
  const raw = (hi - lo) / (count + 1);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let c = Math.ceil(lo / step) * step; c < hi; c += step) if (c > lo) out.push(+c.toPrecision(12));
  return out;
}

/**
 * Marching squares. Crossings are found on grid edges, refined by bisection so
 * every point satisfies f = level to ~1e-12, and joined into polylines by the
 * edge they lie on (so joins are exact, never by distance).
 */
export function contourLines(f: Fxy, xr: readonly [number, number], yr: readonly [number, number], levels: readonly number[], n = 64): ContourLevel[] {
  const { xs, ys, v } = sampleGrid(f, xr, yr, n);
  return levels.map((level) => ({ level, lines: traceLevel(f, xs, ys, v, level) }));
}

function traceLevel(f: Fxy, xs: number[], ys: number[], v: number[][], c: number): Pt2[][] {
  const n = xs.length - 1;
  const above = (i: number, j: number) => v[j]![i]! >= c;
  const ok = (i: number, j: number) => Number.isFinite(v[j]![i]!);
  const point = new Map<string, Pt2>();

  /** Crossing on the edge between grid nodes (i, j) and (i2, j2), refined onto f = c. */
  const crossing = (i: number, j: number, i2: number, j2: number): string => {
    const key = i2 > i ? `h${i},${j}` : `v${i},${j}`;
    if (!point.has(key)) {
      let ax = xs[i]!, ay = ys[j]!, bx = xs[i2]!, by = ys[j2]!;
      let fa = v[j]![i]! - c;
      for (let k = 0; k < 50; k++) {
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const fm = f(mx, my) - c;
        if (!Number.isFinite(fm)) break;
        if (fm === 0) {
          ax = bx = mx;
          ay = by = my;
          break;
        }
        if (Math.sign(fm) === Math.sign(fa)) {
          ax = mx;
          ay = my;
          fa = fm;
        } else {
          bx = mx;
          by = my;
        }
      }
      point.set(key, [(ax + bx) / 2, (ay + by) / 2]);
    }
    return key;
  };

  // segments as pairs of edge keys
  const segs: [string, string][] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!(ok(i, j) && ok(i + 1, j) && ok(i + 1, j + 1) && ok(i, j + 1))) continue;
      const code = (above(i, j) ? 1 : 0) | (above(i + 1, j) ? 2 : 0) | (above(i + 1, j + 1) ? 4 : 0) | (above(i, j + 1) ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const bottom = () => crossing(i, j, i + 1, j);
      const right = () => crossing(i + 1, j, i + 1, j + 1);
      const top = () => crossing(i, j + 1, i + 1, j + 1);
      const left = () => crossing(i, j, i, j + 1);
      const centreAbove = () => f((xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2) >= c;
      switch (code) {
        case 1: case 14: segs.push([left(), bottom()]); break;
        case 2: case 13: segs.push([bottom(), right()]); break;
        case 3: case 12: segs.push([left(), right()]); break;
        case 4: case 11: segs.push([right(), top()]); break;
        case 6: case 9: segs.push([bottom(), top()]); break;
        case 7: case 8: segs.push([left(), top()]); break;
        case 5:
          if (centreAbove()) segs.push([left(), top()], [bottom(), right()]);
          else segs.push([left(), bottom()], [right(), top()]);
          break;
        case 10:
          if (centreAbove()) segs.push([left(), bottom()], [right(), top()]);
          else segs.push([left(), top()], [bottom(), right()]);
          break;
      }
    }
  }

  // join segments that share an edge key
  const adj = new Map<string, number[]>();
  segs.forEach(([a, b], k) => {
    adj.set(a, [...(adj.get(a) ?? []), k]);
    adj.set(b, [...(adj.get(b) ?? []), k]);
  });
  const used = new Array(segs.length).fill(false);
  const lines: Pt2[][] = [];
  const walk = (start: string, k0: number): string[] => {
    const keys = [start];
    let k = k0;
    let cur = start;
    while (k >= 0 && !used[k]) {
      used[k] = true;
      const [a, b] = segs[k]!;
      cur = a === cur ? b : a;
      keys.push(cur);
      k = (adj.get(cur) ?? []).find((q) => !used[q]) ?? -1;
    }
    return keys;
  };
  // open lines first (start at keys used once), then closed loops
  for (const [key, ks] of adj) if (ks.length === 1 && !used[ks[0]!]) lines.push(walk(key, ks[0]!).map((q) => point.get(q)!));
  segs.forEach(([a], k) => {
    if (!used[k]) lines.push(walk(a, k).map((q) => point.get(q)!));
  });
  return lines.filter((l) => l.length >= 2);
}
