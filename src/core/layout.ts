// Shared scene types and layout helpers used by every figure kind.
import type { FigureIssue } from '../spec/index.ts';
import { centeredBox, type Anchor } from './labels.ts';
import type { AnyRole, ByeTheme } from './theme.ts';
import type { Rect, Viewport } from './view.ts';
import type { Polyline } from './sample.ts';

export type Pt = [number, number];
export type FontKind = 'math' | 'mathItalic' | 'note';

/** Measures label sizes. The renderer can supply exact measurements; the defaults approximate. */
export interface Measure {
  text(text: string, fontSize: number, font: FontKind): { width: number; height: number };
  tex(tex: string, fontSize: number): { width: number; height: number };
}

export const approxMeasure: Measure = {
  text: (t, fs, font) => ({ width: [...t].length * fs * (font === 'note' ? 0.56 : 0.5), height: fs * 1.2 }),
  tex: (t, fs) => {
    const visible = t.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_\\]/g, '');
    return { width: Math.max(1, [...visible].length) * fs * 0.55, height: fs * 1.4 };
  },
};

export interface Common {
  /** Stable key for React lists; derived from the element index. */
  key: string;
  role: AnyRole;
  /** Draw inside the plot-area clip (curves, regions) or not (axes, labels). */
  clip: boolean;
  /** How this primitive animates in (see animate.ts). Absent = static. */
  anim?: PrimAnim;
  /** 0..1, set on animation frames while fading in. */
  opacity?: number;
}

/**
 * Animation data carried by a primitive. Times in ms from when the figure appears.
 * - draw: a stroke grows; `span` is this piece's share of its element's timeline (curves with gaps draw piece by piece).
 * - fill: a region sweeps left to right; `top`/`bottom` are its edges in px, left to right.
 * - move: a point glides along `path` (px), ending at its final position.
 * - fade: opacity 0 → 1.
 * - follow: a label that moves with the point `target` (keeps its final offset).
 * - grow: a bar rises from `baseline` (px y) to its full height.
 */
export type PrimAnim =
  | { kind: 'draw'; delay: number; duration: number; span: [number, number] }
  | { kind: 'fill'; delay: number; duration: number; top: Pt[]; bottom: Pt[] }
  | { kind: 'move'; delay: number; duration: number; path: Pt[] }
  | { kind: 'fade'; delay: number; duration: number }
  | { kind: 'follow'; target: string }
  | { kind: 'grow'; delay: number; duration: number; baseline: number };

export const LABEL_FADE_MS = 250;

export type Primitive =
  /** `width` overrides the role's stroke width. */
  | (Common & { kind: 'polyline'; points: Pt[]; width?: number })
  /** `fillOpacity` overrides the role's; `outline` strokes the edge in the role colour (chart bars). */
  | (Common & { kind: 'polygon'; points: Pt[]; fillOpacity?: number; outline?: boolean })
  | (Common & { kind: 'line'; from: Pt; to: Pt; width?: number; dash?: number[] })
  /** `hollow`: an open dot (value not included). */
  | (Common & { kind: 'circle'; center: Pt; r: number; hollow?: boolean })
  | (Common & { kind: 'text'; x: number; y: number; anchor: Anchor; text: string; font: FontKind; fontSize: number; box: Rect })
  | (Common & { kind: 'mathLabel'; box: Rect; tex: string; fontSize: number });

export interface Scene {
  width: number;
  height: number;
  /** Plot area inside the padding; clipped primitives are clipped to it. */
  plot: Rect;
  viewport: Viewport;
  primitives: Primitive[];
  /** Accessibility label. */
  describe: string;
  /** Sampled curves in math coordinates, by function id (for tests and later animation). */
  samples: Record<string, Polyline[]>;
  theme: ByeTheme;
}

export interface SceneOptions {
  width: number;
  /** Defaults to width / (figure.aspect ?? 16/9). */
  height?: number;
  theme?: ByeTheme;
  measure?: Partial<Measure>;
}

export type SceneResult = { ok: true; scene: Scene } | { ok: false; errors: FigureIssue[] };

export function polylineLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return l;
}

export function textPrim(key: string, role: AnyRole, text: string, font: FontKind, fontSize: number, box: Rect): Primitive {
  // Baseline: vertically centre the em box in the label box, ascent ≈ 0.8em.
  const y = box.y + (box.height - fontSize) / 2 + fontSize * 0.8;
  return { kind: 'text', key, role, clip: false, x: box.x + box.width / 2, y, anchor: 'middle', text, font, fontSize, box };
}

export function tickLabel(key: string, text: string, size: number, m: { width: number; height: number }, box: Rect) {
  return {
    req: { key, width: m.width, height: m.height, explicit: true, candidates: [{ box }] },
    make: (b: Rect) => textPrim(key, 'note', text, 'math', size, b),
  };
}

/** Small shifts around an explicit position, so a hand-placed note can dodge a curve. */
export function nudges(c: Pt, w: number, h: number) {
  const offsets: Pt[] = [[0, 0], [0, -6], [0, 6], [8, 0], [-8, 0], [0, -12], [0, 12], [12, -8], [-12, -8]];
  return offsets.map(([dx, dy]) => ({ box: centeredBox(c[0] + dx, c[1] + dy, w, h) }));
}

/** Area-weighted centroid of a polygon (px). Falls back to the vertex mean for degenerate shapes. */
export function centroid(points: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [xa, ya] = points[i]!;
    const [xb, yb] = points[(i + 1) % points.length]!;
    const cross = xa * yb - xb * ya;
    a += cross;
    cx += (xa + xb) * cross;
    cy += (ya + yb) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Multiples of step within [lo, hi]. */
export function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0)) return out;
  const start = Math.ceil(lo / step - 1e-9);
  const end = Math.floor(hi / step + 1e-9);
  if (end - start > 1000) return out;
  for (let k = start; k <= end; k++) out.push(+(k * step).toPrecision(12));
  return out;
}

export function niceStep(span: number): number {
  const raw = span / 8;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function formatNumber(v: number): string {
  const s = +v.toPrecision(10);
  return s < 0 ? `−${-s}` : String(s);
}
