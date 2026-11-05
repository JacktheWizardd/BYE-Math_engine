import { compile, ExprError, parseExpr } from '../../expr/index.ts';
import type { Animate, AnimationKind, Coord, FigureIssue, Label } from '../../spec/index.ts';
import { centeredBox, placeLabels, type LabelRequest, type Obstacles } from '../labels.ts';
import { approxMeasure, LABEL_FADE_MS, textPrim, type FontKind, type Measure, type PrimAnim, type Primitive, type SceneOptions } from '../layout.ts';
import { ByeLightTheme, type AnyRole, type ByeTheme } from '../theme.ts';
import type { Rect } from '../view.ts';

/** Shared state for laying out one figure of any kind. */
export interface KindContext {
  width: number;
  height: number;
  theme: ByeTheme;
  measure: Measure;
  errors: FigureIssue[];
  prims: Primitive[];
  labels: { req: LabelRequest; make: (box: Rect) => Primitive }[];
  obstacles: Obstacles;
}

export function makeContext(opts: SceneOptions, defaultAspect: number, aspect?: number, height?: number): KindContext {
  const width = opts.width;
  return {
    width,
    height: opts.height ?? height ?? width / (aspect ?? defaultAspect),
    theme: opts.theme ?? ByeLightTheme,
    measure: { ...approxMeasure, ...opts.measure },
    errors: [],
    prims: [],
    labels: [],
    obstacles: { strokes: [], axes: [], points: [] },
  };
}

export const exprMessage = (e: unknown): string => (e instanceof ExprError ? e.describe() : String((e as Error)?.message ?? e));

/** Evaluates a constant coordinate (number or expression like "sqrt(2)"); records an error and returns NaN on failure. */
export function constValue(c: Coord, path: string, errors: FigureIssue[]): number {
  if (typeof c === 'number') return c;
  try {
    const v = compile(parseExpr(c, { variables: [], functions: [] }))(NaN);
    if (!Number.isFinite(v)) errors.push({ path, message: `"${c}" is not a finite number` });
    return v;
  } catch (e) {
    errors.push({ path, message: exprMessage(e) });
    return NaN;
  }
}

export interface ResolvedAnim {
  kind: AnimationKind;
  delay: number;
  duration: number;
}

/** Resolve `animate` with a default kind; reject kinds the element can't do. */
export function resolveAnim(a: Animate | undefined, natural: AnimationKind, allowed: AnimationKind[], path: string, errors: FigureIssue[], what: string): ResolvedAnim | undefined {
  if (!a) return undefined;
  const o = typeof a === 'object' ? a : {};
  const kind = o.kind ?? natural;
  if (!allowed.includes(kind)) {
    errors.push({ path: `${path}.animate.kind`, message: `"${kind}" doesn't apply to ${what}` });
    return undefined;
  }
  return { kind, delay: o.delay ?? 0, duration: o.duration ?? 700 };
}

export const fadeOf = (a: ResolvedAnim): PrimAnim => ({ kind: 'fade', delay: a.delay, duration: a.duration });
export const afterOf = (a: ResolvedAnim): PrimAnim => ({ kind: 'fade', delay: a.delay + a.duration, duration: LABEL_FADE_MS });

const fs = (ctx: KindContext, n: number) => Math.max(ctx.theme.fontSize.min, n);

/**
 * Queue a label (text or TeX) with candidate boxes, placed later by `finishLabels`.
 * `candidates(w, h)` returns boxes in order of preference.
 */
export function queueLabel(
  ctx: KindContext,
  key: string,
  label: Label | { text?: string; tex?: string },
  role: AnyRole,
  candidates: (w: number, h: number) => Rect[],
  opts: { font?: FontKind; size?: number; anim?: PrimAnim; explicit?: boolean } = {},
) {
  const size = fs(ctx, opts.size ?? ctx.theme.fontSize.label);
  if (label.tex !== undefined) {
    const m = ctx.measure.tex(label.tex, size);
    const boxes = candidates(m.width, m.height);
    ctx.labels.push({
      req: { key, width: m.width, height: m.height, explicit: !!opts.explicit, candidates: boxes.map((box) => ({ box })) },
      make: (box) => ({ kind: 'mathLabel', key, role, clip: false, box, tex: label.tex!, fontSize: size, ...(opts.anim ? { anim: opts.anim } : {}) }),
    });
    return;
  }
  const text = label.text ?? '';
  const font: FontKind = opts.font ?? (/^[A-Za-z][′']*$/.test(text) ? 'mathItalic' : 'math');
  const m = ctx.measure.text(text, size, font);
  const boxes = candidates(m.width, m.height);
  ctx.labels.push({
    req: { key, width: m.width, height: m.height, explicit: !!opts.explicit, candidates: boxes.map((box) => ({ box })) },
    make: (box) => {
      const p = textPrim(key, role, text, font, size, box);
      return opts.anim ? { ...p, anim: opts.anim } : p;
    },
  });
}

/** Place all queued labels (inside the canvas, avoiding strokes and each other) and add them. */
export function finishLabels(ctx: KindContext) {
  const { placed } = placeLabels(
    ctx.labels.map((l) => l.req),
    { x: 0, y: 0, width: ctx.width, height: ctx.height },
    ctx.obstacles,
    { clamp: true },
  );
  placed.forEach((p, i) => ctx.prims.push(ctx.labels[i]!.make(p.box)));
}

/** Boxes centred above/below a point, nudged sideways if needed. */
export function aboveBelow(x: number, y: number, w: number, h: number, gap: number, prefer: 'above' | 'below' = 'above'): Rect[] {
  // two tiers above, so a second label can stack over a first one instead of dropping onto the ticks
  const above = [0, 1].flatMap((tier) => [0, -10, 10, -20, 20].map((dx) => centeredBox(x + dx, y - gap - h / 2 - tier * (h + 2), w, h)));
  const below = [0, -10, 10].map((dx) => centeredBox(x + dx, y + gap + h / 2, w, h));
  return prefer === 'above' ? [...above, ...below] : [...below, ...above];
}

/** Small filled triangle pointing along (dx, dy) with its tip at (x, y). */
export function arrowHead(x: number, y: number, dx: number, dy: number, size = 7): [number, number][] {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x - ux * size;
  const by = y - uy * size;
  const half = size * 0.45;
  return [
    [x, y],
    [bx - uy * half, by + ux * half],
    [bx + uy * half, by - ux * half],
  ];
}

export interface FittedText {
  size: number;
  lines: string[];
}

/**
 * Fits a label into `maxWidth`: at most `maxLines` lines (wrapped at spaces), shrinking
 * from `size` down to `minSize`; if it still doesn't fit, the last line ends in "…".
 */
export function fitText(text: string, maxWidth: number, size: number, minSize: number, measure: Measure, font: FontKind, maxLines = 2): FittedText {
  const width = (t: string, fs: number) => measure.text(t, fs, font).width;
  const wrap = (fs: number): string[] | null => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (width(w, fs) > maxWidth) return null; // a single word too wide at this size
      const next = cur ? `${cur} ${w}` : w;
      if (width(next, fs) <= maxWidth) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
  };
  for (let fs = size; fs >= minSize - 1e-9; fs -= 0.5) {
    const lines = wrap(fs);
    if (lines) return { size: fs, lines };
  }
  // Still too long at the smallest size: fill the lines character by character and end with "…".
  const lines: string[] = [];
  let rest = text.trim();
  for (let l = 0; l < maxLines && rest; l++) {
    const last = l === maxLines - 1;
    let n = rest.length;
    while (n > 1 && width(rest.slice(0, n).trimEnd() + (last && n < rest.length ? '…' : ''), minSize) > maxWidth) n--;
    if (!last) {
      const space = rest.slice(0, n).lastIndexOf(' ');
      if (space > 0 && n < rest.length) n = space;
    }
    lines.push(rest.slice(0, n).trimEnd() + (last && n < rest.length ? '…' : ''));
    rest = rest.slice(n).trimStart();
  }
  return { size: minSize, lines };
}
