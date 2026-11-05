/** Statistics used by charts. Pure functions; inputs are not mutated. */

export const sortNumbers = (data: readonly number[]) => [...data].sort((a, b) => a - b);

export function median(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const m = Math.floor(n / 2);
  return n % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

export interface FiveNumber {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/**
 * Five-number summary. "exclusive": quartiles are medians of the lower/upper halves,
 * leaving out the median when n is odd (the usual textbook / TI-84 method).
 * "inclusive": the median is included in both halves when n is odd.
 */
export function fiveNumber(data: readonly number[], method: 'exclusive' | 'inclusive' = 'exclusive'): FiveNumber {
  const s = sortNumbers(data);
  const n = s.length;
  if (n === 0) throw new Error('no data');
  if (n === 1) return { min: s[0]!, q1: s[0]!, median: s[0]!, q3: s[0]!, max: s[0]! };
  const half = Math.floor(n / 2);
  const odd = n % 2 === 1;
  const lower = s.slice(0, odd && method === 'inclusive' ? half + 1 : half);
  const upper = s.slice(odd ? (method === 'inclusive' ? half : half + 1) : half);
  return { min: s[0]!, q1: median(lower), median: median(s), q3: median(upper), max: s[n - 1]! };
}

export interface BoxStats extends FiveNumber {
  iqr: number;
  /** Whisker ends: the most extreme values inside the 1.5·IQR fences. */
  low: number;
  high: number;
  outliers: number[];
}

export function boxStats(data: readonly number[], method: 'exclusive' | 'inclusive' = 'exclusive'): BoxStats {
  const f = fiveNumber(data, method);
  const iqr = f.q3 - f.q1;
  const lo = f.q1 - 1.5 * iqr;
  const hi = f.q3 + 1.5 * iqr;
  const inside = sortNumbers(data).filter((x) => x >= lo && x <= hi);
  return {
    ...f,
    iqr,
    low: inside[0] ?? f.min,
    high: inside[inside.length - 1] ?? f.max,
    outliers: sortNumbers(data.filter((x) => x < lo || x > hi)),
  };
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

export type BinSpec = number | { width: number; start?: number } | { edges: number[] };

const tidy = (x: number) => +x.toPrecision(12);

/** Histogram bins: [a, b) except the last, which is closed. Throws with a readable message on bad input. */
export function histogram(data: readonly number[], spec: BinSpec | undefined): Bin[] {
  const s = sortNumbers(data);
  const min = s[0]!;
  const max = s[s.length - 1]!;
  let edges: number[];
  if (spec === undefined || typeof spec === 'number') {
    const k = spec ?? Math.max(1, Math.ceil(Math.log2(s.length) + 1)); // Sturges
    const width = max > min ? (max - min) / k : 1;
    edges = Array.from({ length: k + 1 }, (_, i) => tidy(min + i * width));
  } else if ('edges' in spec) {
    edges = [...spec.edges];
    if (edges.some((e, i) => i > 0 && e <= edges[i - 1]!)) throw new Error('bin edges must increase');
  } else {
    const start = spec.start ?? Math.floor(min / spec.width) * spec.width;
    if (start > min) throw new Error(`bins start at ${start}, after the smallest value ${min}`);
    edges = [tidy(start)];
    while (edges[edges.length - 1]! <= max || edges.length < 2) edges.push(tidy(edges[edges.length - 1]! + spec.width));
    if (edges.length > 201) throw new Error('more than 200 bins; use a wider bin width');
  }
  const first = edges[0]!;
  const last = edges[edges.length - 1]!;
  const outside = s.filter((x) => x < first || x > last);
  if (outside.length) throw new Error(`${outside.length} value(s) fall outside the bins [${first}, ${last}]`);
  const bins: Bin[] = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1]!, count: 0 }));
  for (const x of s) {
    let i = bins.findIndex((b) => x >= b.from && x < b.to);
    if (i < 0) i = bins.length - 1; // x === last edge
    bins[i]!.count++;
  }
  return bins;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Pearson correlation (NaN if y is constant). */
  r: number;
}

/** Least-squares line y = slope·x + intercept. */
export function linearFit(points: readonly (readonly [number, number])[]): LinearFit {
  const n = points.length;
  if (n < 2) throw new Error('a line of best fit needs at least 2 points');
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  if (sxx === 0) throw new Error('all points have the same x; no line of best fit');
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy) };
}

/** Values rounded to `step`, counted: [[value, count], …] sorted by value. */
export function dotStacks(data: readonly number[], step = 1): [number, number][] {
  const counts = new Map<number, number>();
  for (const x of data) {
    const v = tidy(Math.round(x / step) * step);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

/** A round axis range covering [lo, hi]. */
export function niceBounds(lo: number, hi: number, pad = 0): [number, number, number] {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * pad;
  hi += span * pad;
  const raw = (hi - lo) / 6;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  return [tidy(Math.floor(lo / step) * step), tidy(Math.ceil(hi / step) * step), step];
}
