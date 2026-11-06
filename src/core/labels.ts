import type { Rect } from './view.ts';

export type Anchor = 'start' | 'middle' | 'end';

/** A candidate box for a label, in px. Earlier candidates are preferred. */
export interface Candidate {
  box: Rect;
}

export interface LabelRequest {
  key: string;
  width: number;
  height: number;
  candidates: Candidate[];
  /** If true, the first candidate was asked for explicitly ("below"): grow padding rather than move it. */
  explicit: boolean;
  /** How many leading candidates are on the asked-for side (below, below-left, below-right). Default 1. */
  keep?: number;
  /** Farther spots, tried only when every candidate crosses a stroke, covers a dot or overlaps a label. */
  fallback?: Candidate[];
  /** Keys of the strokes this label annotates (a contour's level): still avoided, but not reported. */
  own?: readonly string[];
  /** Don't report this label's collisions (axis tick numbers). */
  quiet?: boolean;
}

/** A line labels should not cross, px; `key` names the primitive it came from. */
export interface Stroke {
  key: string;
  points: [number, number][];
}

export interface Obstacles {
  /** Polylines labels should not cross (curves, lines, segments). */
  strokes: Stroke[];
  /** Axis lines: crossing them is discouraged, less strongly. */
  axes: [number, number][][];
  /** Filled dots. */
  points: { x: number; y: number; r: number }[];
}

export interface Placed {
  key: string;
  box: Rect;
}

/** A label that still crosses something after placement: stroke keys, label keys and how many dots it covers. */
export interface LabelCollision {
  key: string;
  strokes: string[];
  labels: string[];
  points: number;
}

export interface Overflow {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Box with its anchor point at (x, y): horizontal anchor and vertical position (top/middle/bottom of the box). */
export function boxAt(x: number, y: number, w: number, h: number, anchor: Anchor, vertical: 'top' | 'middle' | 'bottom'): Rect {
  const bx = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
  const by = vertical === 'top' ? y : vertical === 'middle' ? y - h / 2 : y - h;
  return { x: bx, y: by, width: w, height: h };
}

export function centeredBox(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/**
 * Box placed beside an anchor point in direction (nx, ny) with a gap,
 * i.e. the box edge nearest the point is `gap` px away along that direction.
 */
export function boxBeside(px: number, py: number, nx: number, ny: number, gap: number, w: number, h: number): Rect {
  const len = Math.hypot(nx, ny) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const extent = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
  return centeredBox(px + ux * (gap + extent), py + uy * (gap + extent), w, h);
}

const overflowOf = (b: Rect, canvas: Rect): Overflow => ({
  left: Math.max(0, canvas.x - b.x),
  top: Math.max(0, canvas.y - b.y),
  right: Math.max(0, b.x + b.width - (canvas.x + canvas.width)),
  bottom: Math.max(0, b.y + b.height - (canvas.y + canvas.height)),
});

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** The part of segment p→q inside rectangle r, as [t0, t1] along it, or null if it misses (Liang–Barsky). */
function clipSegment(p: readonly [number, number], q: readonly [number, number], r: Rect): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const clip = (den: number, num: number): boolean => {
    if (den === 0) return num >= 0;
    const t = num / den;
    if (den < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  const inside =
    clip(-dx, p[0] - r.x) &&
    clip(dx, r.x + r.width - p[0]) &&
    clip(-dy, p[1] - r.y) &&
    clip(dy, r.y + r.height - p[1]) &&
    t0 <= t1;
  return inside ? [t0, t1] : null;
}

/** Does segment p→q intersect rectangle r? */
export function segmentHitsRect(p: readonly [number, number], q: readonly [number, number], r: Rect): boolean {
  return clipSegment(p, q, r) !== null;
}

/**
 * How much of a polyline lies inside r, px, or -1 if it misses r entirely (0 means it only touches it).
 * Measured as length, so it doesn't depend on how finely the line was sampled.
 */
export function strokeInside(pts: readonly [number, number][], r: Rect): number {
  let len = -1;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    // cheap reject: the segment's bounding box misses r
    if (Math.max(p[0], q[0]) < r.x || Math.min(p[0], q[0]) > r.x + r.width) continue;
    if (Math.max(p[1], q[1]) < r.y || Math.min(p[1], q[1]) > r.y + r.height) continue;
    const t = clipSegment(p, q, r);
    if (t) len = Math.max(len, 0) + (t[1] - t[0]) * Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return len;
}

/**
 * Boxes around (x, y) farther out than the usual candidates, nearest first: `gaps` px from the point to
 * the box edge, in 16 directions. For labels whose nearby spots all cross something.
 */
export function ring(x: number, y: number, w: number, h: number, gaps: readonly number[]): Candidate[] {
  const boxes: { box: Rect; d: number }[] = [];
  for (const g of gaps)
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const box = boxBeside(x, y, Math.cos(a), Math.sin(a), g, w, h);
      boxes.push({ box, d: Math.hypot(box.x + w / 2 - x, box.y + h / 2 - y) });
    }
  return boxes.sort((a, b) => a.d - b.d).map(({ box }) => ({ box }));
}

const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d });

/** Cost of a label crossing one stroke, plus `STROKE_PER_PX` for each px of the stroke inside the box. */
const STROKE_COST = 150;
const STROKE_PER_PX = 1.5;
const AXIS_COST = 25;
const DOT_COST = 200;
const OVERLAP_PER_PX2 = 50;
const OVERFLOW_PER_PX = 1000;

/**
 * Greedy label placement: for each label pick the candidate with the lowest cost (outside the canvas ≫
 * covering a dot or overlapping another label ≫ crossing a curve, by how much of it is inside ≫ crossing
 * an axis ≫ preference order), then clamp it inside the canvas. A label whose nearby candidates all clash
 * also tries its `fallback` spots.
 *
 * `explicitOverflow`: px an explicit label's asked-for boxes (the first `keep`) may stick out past each side at no
 * cost, because the caller grows the padding by the reported `overflow` and lays out again. Leave it 0
 * when nothing grows the padding.
 *
 * `collisions` lists the labels that, where they ended up, still cross a stroke, cover a dot or overlap
 * another label.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  canvas: Rect,
  obstacles: Obstacles,
  { clamp = true, margin = 2, explicitOverflow = 0 }: { clamp?: boolean; margin?: number; explicitOverflow?: number } = {},
): { placed: Placed[]; overflow: Overflow; collisions: LabelCollision[] } {
  const inner: Rect = { x: canvas.x + margin, y: canvas.y + margin, width: canvas.width - 2 * margin, height: canvas.height - 2 * margin };
  const placed: Placed[] = [];
  const overflow: Overflow = { top: 0, right: 0, bottom: 0, left: 0 };
  const grow = (o: Overflow) => {
    overflow.top = Math.max(overflow.top, o.top);
    overflow.right = Math.max(overflow.right, o.right);
    overflow.bottom = Math.max(overflow.bottom, o.bottom);
    overflow.left = Math.max(overflow.left, o.left);
  };
  const dotBox = (pt: Obstacles['points'][number]): Rect => ({ x: pt.x - pt.r, y: pt.y - pt.r, width: 2 * pt.r, height: 2 * pt.r });

  const costOf = (req: LabelRequest, b: Rect, i: number): number => {
    const probe = inflate(b, 1.5);
    const o = overflowOf(b, inner);
    const free = req.explicit && i < (req.keep ?? 1) ? explicitOverflow : 0;
    let cost = (Math.max(0, o.left - free) + Math.max(0, o.right - free) + Math.max(0, o.top - free) + Math.max(0, o.bottom - free)) * OVERFLOW_PER_PX;
    for (const p of placed) cost += overlapArea(inflate(p.box, 2), b) * OVERLAP_PER_PX2;
    for (const s of obstacles.strokes) {
      const len = strokeInside(s.points, probe);
      if (len >= 0) cost += STROKE_COST + len * STROKE_PER_PX;
    }
    for (const s of obstacles.axes) if (strokeInside(s, probe) >= 0) cost += AXIS_COST;
    for (const pt of obstacles.points) if (overlapArea(probe, dotBox(pt)) > 0) cost += DOT_COST;
    return cost + i * 2;
  };

  for (const req of requests) {
    let best: Rect | null = null;
    let bestCost = Infinity;
    const consider = (c: Candidate, i: number) => {
      const cost = costOf(req, c.box, i);
      if (cost < bestCost) {
        bestCost = cost;
        best = c.box;
      }
    };
    req.candidates.forEach(consider);
    // Every nearby spot crosses a stroke, covers a dot or overlaps a label: look farther out.
    if (bestCost >= STROKE_COST && req.fallback) req.fallback.forEach((c, k) => consider(c, req.candidates.length + k));
    let box: Rect = best ?? req.candidates[0]?.box ?? { x: 0, y: 0, width: req.width, height: req.height };
    // Explicit placements ("below") keep their side: report how far they stick out so the caller can
    // add padding. Other labels move (or get clamped) instead, so they stay next to what they label.
    if (req.explicit) grow(overflowOf(box, inner));
    if (clamp) {
      const x = Math.min(Math.max(box.x, inner.x), inner.x + inner.width - box.width);
      const y = Math.min(Math.max(box.y, inner.y), inner.y + inner.height - box.height);
      box = { ...box, x, y };
    }
    placed.push({ key: req.key, box });
  }

  // What each label still runs into where it ended up.
  const collisions: LabelCollision[] = [];
  placed.forEach((p, i) => {
    const req = requests[i]!;
    if (req.quiet) return;
    const strokes = obstacles.strokes.filter((s) => !req.own?.includes(s.key) && strokeInside(s.points, p.box) >= 0).map((s) => s.key);
    const labels = placed.filter((q) => q !== p && overlapArea(q.box, p.box) > 1).map((q) => q.key);
    const points = obstacles.points.filter((pt) => overlapArea(p.box, dotBox(pt)) > 0).length;
    if (strokes.length || labels.length || points) collisions.push({ key: p.key, strokes: [...new Set(strokes)], labels, points });
  });
  return { placed, overflow, collisions };
}
