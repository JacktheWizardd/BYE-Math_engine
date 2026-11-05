import type { Rect } from './view.ts';
import type { PrimAnim, Primitive, Pt, Scene } from './layout.ts';

/**
 * Pure animation timeline. The renderer asks for `frameAt(scene, ms)` on each
 * frame; once an animation is over the original primitive object is returned,
 * so the last frame is identical to the static scene (and unchanged primitives
 * keep their identity, which lets the renderer skip redrawing them).
 */

/** Total length of the scene's animation in ms (0 = nothing animates). */
export function timeline(scene: Scene): number {
  let end = 0;
  for (const p of scene.primitives) {
    if (p.anim && p.anim.kind !== 'follow') end = Math.max(end, p.anim.delay + p.anim.duration);
  }
  return end;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const progress = (a: { delay: number; duration: number }, ms: number) =>
  easeInOutCubic(Math.min(1, Math.max(0, (ms - a.delay) / a.duration)));

const isDone = (a: PrimAnim, ms: number) => a.kind === 'follow' || ms >= a.delay + a.duration;

/** The primitives to draw at time `ms`. Hidden pieces are left out. */
export function frameAt(scene: Scene, ms: number): Primitive[] {
  // Moving points first: their labels follow them.
  const shift = new Map<string, Pt>();
  for (const p of scene.primitives) {
    if (p.kind === 'circle' && p.anim?.kind === 'move' && !isDone(p.anim, ms)) {
      const at = alongPath(p.anim.path, progress(p.anim, ms));
      shift.set(p.key, [at[0] - p.center[0], at[1] - p.center[1]]);
    }
  }

  const out: Primitive[] = [];
  for (const p of scene.primitives) {
    const a = p.anim;
    if (!a) {
      out.push(p);
      continue;
    }
    if (a.kind === 'follow') {
      const d = shift.get(a.target);
      out.push(d ? translate(p, d) : p);
      continue;
    }
    if (isDone(a, ms)) {
      out.push(p);
      continue;
    }
    const t = progress(a, ms);
    const frame = partial(p, a, t);
    if (frame) out.push(frame);
  }
  return out;
}

function partial(p: Primitive, a: Exclude<PrimAnim, { kind: 'follow' }>, t: number): Primitive | null {
  switch (a.kind) {
    case 'fade':
      return t <= 0 ? null : { ...p, opacity: t };
    case 'draw': {
      const [s0, s1] = a.span;
      const local = s1 > s0 ? (t - s0) / (s1 - s0) : t >= s1 ? 1 : 0;
      if (local <= 0) return null;
      if (local >= 1) return p;
      if (p.kind === 'polyline') return { ...p, points: truncate(p.points, local) };
      if (p.kind === 'line') return { ...p, to: lerp(p.from, p.to, local) };
      return { ...p, opacity: local };
    }
    case 'fill': {
      if (t <= 0 || p.kind !== 'polygon') return t <= 0 ? null : p;
      const first = a.top[0]!;
      const last = a.top[a.top.length - 1]!;
      const cut = first[0] + (last[0] - first[0]) * t;
      const top = cutAtX(a.top, cut);
      const bottom = cutAtX(a.bottom, cut);
      return { ...p, points: [...top, ...bottom.reverse()] };
    }
    case 'move': {
      if (p.kind !== 'circle') return p;
      return { ...p, center: alongPath(a.path, t) };
    }
    case 'grow': {
      if (t <= 0) return null;
      if (p.kind !== 'polygon') return { ...p, opacity: t };
      return { ...p, points: p.points.map(([x, y]) => [x, a.baseline + (y - a.baseline) * t] as Pt) };
    }
  }
}

const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** The first `fraction` of a polyline by length. */
export function truncate(points: Pt[], fraction: number): Pt[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    seg.push(l);
    total += l;
  }
  let left = total * fraction;
  const out: Pt[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const l = seg[i - 1]!;
    if (left >= l) {
      out.push(points[i]!);
      left -= l;
    } else {
      if (l > 0) out.push(lerp(points[i - 1]!, points[i]!, left / l));
      break;
    }
  }
  return out;
}

/** Position at `fraction` of a path's length. */
export function alongPath(path: Pt[], fraction: number): Pt {
  if (path.length === 0) return [0, 0];
  if (fraction <= 0) return path[0]!;
  if (fraction >= 1) return path[path.length - 1]!;
  const t = truncate(path, fraction);
  return t[t.length - 1]!;
}

/** The part of an x-sorted edge with x ≤ cut, ending exactly at x = cut. */
export function cutAtX(edge: Pt[], cut: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < edge.length; i++) {
    const p = edge[i]!;
    if (p[0] <= cut) {
      out.push(p);
      continue;
    }
    const prev = edge[i - 1];
    if (prev && p[0] !== prev[0]) out.push(lerp(prev, p, (cut - prev[0]) / (p[0] - prev[0])));
    break;
  }
  return out;
}

function translate(p: Primitive, [dx, dy]: Pt): Primitive {
  const box = (b: Rect): Rect => ({ ...b, x: b.x + dx, y: b.y + dy });
  if (p.kind === 'text') return { ...p, x: p.x + dx, y: p.y + dy, box: box(p.box) };
  if (p.kind === 'mathLabel') return { ...p, box: box(p.box) };
  return p;
}
