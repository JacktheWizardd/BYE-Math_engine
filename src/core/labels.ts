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
}

export interface Obstacles {
  /** Polylines labels should not cross (curves, lines, segments), px. */
  strokes: [number, number][][];
  /** Axis lines: crossing them is discouraged, less strongly. */
  axes: [number, number][][];
  /** Filled dots. */
  points: { x: number; y: number; r: number }[];
}

export interface Placed {
  key: string;
  box: Rect;
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

/** Does segment p→q intersect rectangle r? (Liang–Barsky) */
export function segmentHitsRect(p: readonly [number, number], q: readonly [number, number], r: Rect): boolean {
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
  return (
    clip(-dx, p[0] - r.x) &&
    clip(dx, r.x + r.width - p[0]) &&
    clip(-dy, p[1] - r.y) &&
    clip(dy, r.y + r.height - p[1]) &&
    t0 <= t1
  );
}

const polylineHits = (pts: readonly [number, number][], r: Rect): number => {
  let hits = 0;
  for (let i = 1; i < pts.length; i++) if (segmentHitsRect(pts[i - 1]!, pts[i]!, r)) hits++;
  return hits;
};

const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d });

/**
 * Greedy label placement: for each label pick the candidate with the lowest
 * cost (outside the canvas ≫ overlapping another label ≫ crossing a curve ≫
 * crossing an axis ≫ preference order), then clamp it inside the canvas.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  canvas: Rect,
  obstacles: Obstacles,
  { clamp = true, margin = 2 }: { clamp?: boolean; margin?: number } = {},
): { placed: Placed[]; overflow: Overflow } {
  const inner: Rect = { x: canvas.x + margin, y: canvas.y + margin, width: canvas.width - 2 * margin, height: canvas.height - 2 * margin };
  const placed: Placed[] = [];
  const overflow: Overflow = { top: 0, right: 0, bottom: 0, left: 0 };
  const grow = (o: Overflow) => {
    overflow.top = Math.max(overflow.top, o.top);
    overflow.right = Math.max(overflow.right, o.right);
    overflow.bottom = Math.max(overflow.bottom, o.bottom);
    overflow.left = Math.max(overflow.left, o.left);
  };

  for (const req of requests) {
    let best: Rect | null = null;
    let bestCost = Infinity;
    req.candidates.forEach((c, i) => {
      const b = c.box;
      const probe = inflate(b, 1.5);
      const o = overflowOf(b, inner);
      let cost = (o.left + o.right + o.top + o.bottom) * 1000;
      for (const p of placed) cost += overlapArea(inflate(p.box, 2), b) * 50;
      for (const s of obstacles.strokes) cost += polylineHits(s, probe) * 120;
      for (const s of obstacles.axes) cost += polylineHits(s, probe) * 25;
      for (const pt of obstacles.points) {
        if (overlapArea(probe, { x: pt.x - pt.r, y: pt.y - pt.r, width: 2 * pt.r, height: 2 * pt.r }) > 0) cost += 200;
      }
      cost += i * 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = b;
      }
    });
    let box: Rect = best ?? req.candidates[0]?.box ?? { x: 0, y: 0, width: req.width, height: req.height };
    // Explicit placements ("below") keep their side: report how far they stick out so the caller can
    // add padding. Other labels move (or get clamped) instead, so they stay next to what they label.
    if (req.explicit && req.candidates[0]) grow(overflowOf(req.candidates[0].box, inner));
    if (clamp) {
      const x = Math.min(Math.max(box.x, inner.x), inner.x + inner.width - box.width);
      const y = Math.min(Math.max(box.y, inner.y), inner.y + inner.height - box.height);
      box = { ...box, x, y };
    }
    placed.push({ key: req.key, box });
  }
  return { placed, overflow };
}
