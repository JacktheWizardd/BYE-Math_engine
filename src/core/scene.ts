import type { FigureIssue, Label, LabelPosition } from '../spec/index.ts';
import { boxAt, boxBeside, centeredBox, placeLabels, ring, type LabelCollision, type LabelRequest, type Obstacles } from './labels.ts';
import {
  approxMeasure,
  centroid,
  formatNumber,
  LABEL_FADE_MS,
  niceStep,
  nudges,
  polylineLength,
  textPrim,
  tickLabel,
  ticks,
  type FontKind,
  type Measure,
  type PrimAnim,
  type Primitive,
  type Pt,
  type Scene,
  type SceneOptions,
  type SceneResult,
} from './layout.ts';
import type { FigureModel, FnInfo, Item, ItemAnim } from './model.ts';
import { contourLines } from './contour.ts';
import { arrowHead } from './kinds/common.ts';
import { sampleFunction, slice, type Polyline } from './sample.ts';
import { ByeLightTheme, type AnyRole, type ByeTheme } from './theme.ts';
import { DEFAULT_ASPECT, plotRect, toPx, type Padding, type Rect, type Vec, type Viewport } from './view.ts';


const BASE_PAD = 6;
const MAX_EXTRA_PAD = 60;
const PX_LIMIT = 1e5;
/** Gaps (px, anchor to box edge) of the farther spots tried when a note's nearby spots all cross something. */
const NOTE_RING = [4, 10, 18, 28];
/** Extra gaps (px, beyond a point label's usual gap) for the farther spots around a point. */
const POINT_RING = [6, 12, 18];


export function buildScene(model: FigureModel, opts: SceneOptions): SceneResult {
  const { figure } = model;
  const theme = opts.theme ?? ByeLightTheme;
  const measure: Measure = { ...approxMeasure, ...opts.measure };
  const width = opts.width;
  const height = opts.height ?? width / (figure.aspect ?? DEFAULT_ASPECT);
  if (!(width > 0 && height > 0)) return { ok: false, errors: [{ path: '', message: 'figure size must be positive' }] };

  const pad = (extra?: Partial<Padding>): Padding => ({
    top: BASE_PAD + Math.min(MAX_EXTRA_PAD, extra?.top ?? 0),
    right: BASE_PAD + Math.min(MAX_EXTRA_PAD, extra?.right ?? 0),
    bottom: BASE_PAD + Math.min(MAX_EXTRA_PAD, extra?.bottom ?? 0),
    left: BASE_PAD + Math.min(MAX_EXTRA_PAD, extra?.left ?? 0),
  });

  // Unclamped passes find how far explicit labels stick out and add that as padding. Growing the padding
  // shrinks the plot, which moves the label too, so it can take another pass or two to fit.
  const extra = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let pass = 0; pass < 3; pass++) {
    const trial = layout(model, theme, measure, width, height, pad(extra), false);
    if (!trial.ok) return trial;
    const o = trial.overflow;
    if (o.top + o.right + o.bottom + o.left === 0) break;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) if (o[side]) extra[side] += o[side] + 2;
  }
  const final = layout(model, theme, measure, width, height, pad(extra), true);
  if (!final.ok) return final;
  return { ok: true, scene: final.collisions.length ? { ...final.scene, labelCollisions: final.collisions } : final.scene };
}

type LayoutResult =
  | { ok: true; scene: Scene; overflow: { top: number; right: number; bottom: number; left: number }; collisions: LabelCollision[] }
  | { ok: false; errors: FigureIssue[] };

function layout(
  model: FigureModel,
  theme: ByeTheme,
  measure: Measure,
  width: number,
  height: number,
  padding: Padding,
  clamp: boolean,
): LayoutResult {
  const { figure } = model;
  const vp: Viewport = { x: figure.view.x, y: figure.view.y, width, height, padding };
  const plot = plotRect(vp);
  const px = (p: Vec): Pt => {
    const [x, y] = toPx(vp, p);
    return [Math.max(-PX_LIMIT, Math.min(PX_LIMIT, x)), Math.max(-PX_LIMIT, Math.min(PX_LIMIT, y))];
  };
  const errors: FigureIssue[] = [];
  const prims: Primitive[] = [];
  const labels: { req: LabelRequest; make: (box: Rect) => Primitive }[] = [];
  const obstacles: Obstacles = { strokes: [], axes: [], points: [] };
  const [x0, x1] = figure.view.x;
  const [y0, y1] = figure.view.y;
  const fs = (n: number) => Math.max(theme.fontSize.min, n);

  // --- animation helpers
  const labelAnims = new Map<string, PrimAnim>();
  const strokeAnim = (a: ItemAnim, span: [number, number]): PrimAnim =>
    a.kind === 'draw' ? { kind: 'draw', delay: a.delay, duration: a.duration, span } : { kind: 'fade', delay: a.delay, duration: a.duration };
  /** An element's label fades in once the element has finished, or rides along with a moving point. */
  function setLabelAnim(item: Item, movingKey?: string) {
    const a = item.anim;
    if (!a || !item.el.label) return;
    const key = `label-${item.index}`;
    if (movingKey) labelAnims.set(key, { kind: 'follow', target: movingKey });
    else if (a.kind === 'fade') labelAnims.set(key, { kind: 'fade', delay: a.delay, duration: a.duration });
    else labelAnims.set(key, { kind: 'fade', delay: a.delay + a.duration, duration: LABEL_FADE_MS });
  }

  // --- grid
  if (figure.grid) {
    const { x: gx, y: gy } = figure.grid;
    if (gx) for (const v of ticks(x0, x1, gx)) prims.push({ kind: 'line', key: `grid-x-${v}`, role: 'grid', clip: false, from: px([v, y0]), to: px([v, y1]) });
    if (gy) for (const v of ticks(y0, y1, gy)) prims.push({ kind: 'line', key: `grid-y-${v}`, role: 'grid', clip: false, from: px([x0, v]), to: px([x1, v]) });
  }

  // --- sample every function once; regions reuse the same samples.
  const samples: Record<string, Polyline[]> = {};
  const runsOf = new Map<FnInfo, Polyline[]>();
  for (const item of model.items) {
    if (item.type !== 'function') continue;
    const runs = sampleFunction(item.fn.fn, item.fn.range, vp, { breakpoints: item.fn.breakpoints });
    runsOf.set(item.fn, runs);
    samples[item.fn.id] = runs;
  }

  // --- regions (drawn under everything else but the grid)
  for (const item of model.items) {
    if (item.type !== 'region') continue;
    const path = `elements[${item.index}]`;
    const top = sliceOne(runsOf.get(item.top) ?? [], item.from, item.to);
    const bottom = item.bottom ? sliceOne(runsOf.get(item.bottom) ?? [], item.from, item.to) : null;
    if (!top) {
      errors.push({ path, message: `"${item.top.id}" has a gap or is undefined between ${item.from} and ${item.to}; a region can't span it` });
      continue;
    }
    if (item.bottom && !bottom) {
      errors.push({ path, message: `"${item.bottom.id}" has a gap or is undefined between ${item.from} and ${item.to}; a region can't span it` });
      continue;
    }
    const math: Polyline = bottom ? [...top, ...[...bottom].reverse()] : [[item.from, 0], ...top, [item.to, 0]];
    const points = math.map((p) => px(p));
    const region: Primitive = { kind: 'polygon', key: `el-${item.index}`, role: item.el.role, clip: true, points };
    if (item.anim) {
      const { delay, duration } = item.anim;
      region.anim =
        item.anim.kind === 'fill'
          ? { kind: 'fill', delay, duration, top: top.map((p) => px(p)), bottom: (bottom ?? [[item.from, 0], [item.to, 0]]).map((p) => px(p)) }
          : { kind: 'fade', delay, duration };
      setLabelAnim(item);
    }
    prims.push(region);
    if (item.el.label) {
      const c = centroid(points);
      const topMid = px([(item.from + item.to) / 2, item.top.fn((item.from + item.to) / 2)]);
      addLabel(item.index, item.el.label, item.el.role, (w, h, pos) => {
        // Centroid first, then nearby spots; thin regions push the label just outside the boundary.
        const offsets: Pt[] = [[0, 0], [0, -8], [0, 8], [0, -16], [0, 16], [-16, 0], [16, 0], [0, -24], [0, 24], [-24, -16], [24, 16], [-24, 16], [24, -16], [0, -36], [0, 36], [-36, -24], [36, 24]];
        const center = offsets.map(([dx, dy]) => centeredBox(c[0] + dx, c[1] + dy, w, h));
        if (pos === 'above') return [boxAt(topMid[0], topMid[1] - 6, w, h, 'middle', 'bottom'), ...center];
        return center;
      });
    }
  }

  // --- axes
  const axes = figure.axes === false ? null : (figure.axes ?? { x: true, y: true, labels: false });
  if (axes) {
    const ay = y0 <= 0 && 0 <= y1 ? 0 : y0;
    const ax = x0 <= 0 && 0 <= x1 ? 0 : x0;
    if (axes.x) {
      const line: [Pt, Pt] = [px([x0, ay]), px([x1, ay])];
      prims.push({ kind: 'line', key: 'axis-x', role: 'axis', clip: false, from: line[0], to: line[1] });
      obstacles.axes.push(line);
    }
    if (axes.y) {
      const line: [Pt, Pt] = [px([ax, y0]), px([ax, y1])];
      prims.push({ kind: 'line', key: 'axis-y', role: 'axis', clip: false, from: line[0], to: line[1] });
      obstacles.axes.push(line);
    }
    if (axes.labels) {
      const size = fs(theme.fontSize.tick);
      const gx = figure.grid ? (figure.grid.x ?? niceStep(x1 - x0)) : niceStep(x1 - x0);
      const gy = figure.grid ? (figure.grid.y ?? niceStep(y1 - y0)) : niceStep(y1 - y0);
      if (axes.x) {
        for (const v of ticks(x0, x1, gx)) {
          if ((v === ax && axes.y) || v === x0 || v === x1) continue; // edge ticks get cut off or collide
          const text = formatNumber(v);
          const m = measure.text(text, size, 'math');
          const [tx, ty] = px([v, ay]);
          labels.push(tickLabel(`tick-x-${v}`, text, size, m, boxAt(tx, ty + 3, m.width, m.height, 'middle', 'top')));
        }
      }
      if (axes.y) {
        for (const v of ticks(y0, y1, gy)) {
          if ((v === ay && axes.x) || v === y0 || v === y1) continue;
          const text = formatNumber(v);
          const m = measure.text(text, size, 'math');
          const [tx, ty] = px([ax, v]);
          labels.push(tickLabel(`tick-y-${v}`, text, size, m, boxAt(tx - 4, ty, m.width, m.height, 'end', 'middle')));
        }
      }
    }
  }

  // --- curves, lines, segments, points, text
  for (const item of model.items) drawItem(item);

  function drawItem(item: Item) {
    const key = `el-${item.index}`;
    switch (item.type) {
      case 'function': {
        const runs = runsOf.get(item.fn) ?? [];
        const pieces = runs.map((r) => r.map((p) => px(p)));
        const lengths = pieces.map(polylineLength);
        const total = lengths.reduce((a, b) => a + b, 0) || 1;
        let done = 0;
        pieces.forEach((points, k) => {
          const prim: Primitive = { kind: 'polyline', key: `${key}-${k}`, role: item.el.role, clip: true, points };
          const span: [number, number] = [done / total, (done + lengths[k]!) / total];
          done += lengths[k]!;
          if (item.anim) prim.anim = strokeAnim(item.anim, span);
          prims.push(prim);
          obstacles.strokes.push({ key: prim.key, points });
        });
        setLabelAnim(item);
        if (item.el.label) functionLabel(item, runs);
        return;
      }
      case 'region':
        return; // drawn above
      case 'segment': {
        const a = px(item.from);
        const b = px(item.to);
        const isVector = item.el.type === 'vector';
        // a vector's shaft stops at the base of its head
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const shaftEnd: Pt = isVector ? [b[0] - ((b[0] - a[0]) / len) * 6, b[1] - ((b[1] - a[1]) / len) * 6] : b;
        prims.push({ kind: 'line', key, role: item.el.role, clip: true, from: a, to: shaftEnd, ...(item.anim ? { anim: strokeAnim(item.anim, [0, 1]) } : {}) });
        if (isVector) {
          const head = arrowHead(b[0], b[1], b[0] - a[0], b[1] - a[1], 10);
          prims.push({ kind: 'polygon', key: `${key}-head`, role: item.el.role, clip: true, points: head, fillOpacity: 1, ...(item.anim ? { anim: { kind: 'fade', delay: item.anim.delay + item.anim.duration * 0.8, duration: item.anim.duration * 0.2 } } : {}) });
        }
        obstacles.strokes.push({ key, points: [a, b] });
        setLabelAnim(item);
        if (item.el.label) segmentLabel(item.index, item.el.label, item.el.role, a, b);
        return;
      }
      case 'line': {
        const seg = clipLine(item.p, item.q, figure.view.x, figure.view.y);
        if (!seg) return;
        const a = px(seg[0]);
        const b = px(seg[1]);
        prims.push({ kind: 'line', key, role: item.el.role, clip: true, from: a, to: b, ...(item.anim ? { anim: strokeAnim(item.anim, [0, 1]) } : {}) });
        obstacles.strokes.push({ key, points: [a, b] });
        setLabelAnim(item);
        if (item.el.label) {
          const at = item.el.label.at;
          if (typeof at === 'number') {
            const t = (at - item.p[0]) / (item.q[0] - item.p[0]);
            const anchor = px([at, item.p[1] + t * (item.q[1] - item.p[1])]);
            alongLabel(item.index, item.el.label, item.el.role, anchor, [b[0] - a[0], b[1] - a[1]]);
          } else segmentLabel(item.index, item.el.label, item.el.role, a, b);
        }
        return;
      }
      case 'point': {
        const c = px(item.at);
        const dot: Primitive = { kind: 'circle', key, role: item.el.role, clip: false, center: c, r: theme.pointRadius, ...('open' in item.el && item.el.open ? { hollow: true } : {}) };
        if (item.anim?.kind === 'move' && item.on && item.anim.from !== undefined) {
          const from = item.anim.from;
          const run = sliceOne(runsOf.get(item.on) ?? [], Math.min(from, item.at[0]), Math.max(from, item.at[0]));
          if (!run) {
            errors.push({ path: `elements[${item.index}].animate`, message: `the point can't move along "${item.on.id}" from x = ${from}: there's a gap in between` });
          } else {
            const path = run.map((p) => px(p));
            if (from > item.at[0]) path.reverse();
            dot.anim = { kind: 'move', delay: item.anim.delay, duration: item.anim.duration, path };
          }
        } else if (item.anim) dot.anim = { kind: 'fade', delay: item.anim.delay, duration: item.anim.duration };
        prims.push(dot);
        setLabelAnim(item, dot.anim?.kind === 'move' ? key : undefined);
        obstacles.points.push({ x: c[0], y: c[1], r: theme.pointRadius });
        if (item.el.label) pointLabel(item.index, item.el.label, item.el.role, c);
        return;
      }
      case 'text': {
        const c = px(item.at);
        const font: FontKind = item.el.role === 'note' ? 'note' : 'math';
        const size = fs(item.el.role === 'note' ? theme.fontSize.note : theme.fontSize.label);
        const m = measure.text(item.el.text, size, font);
        if (item.anim) labelAnims.set(key, { kind: 'fade', delay: item.anim.delay, duration: item.anim.duration });
        labels.push({
          req: { key, width: m.width, height: m.height, explicit: false, candidates: nudges(c, m.width, m.height), fallback: ring(c[0], c[1], m.width, m.height, NOTE_RING) },
          make: (box) => textPrim(key, item.el.role, item.el.text, font, size, box),
        });
        return;
      }
      case 'contour': {
        const levels = contourLines(item.fn, figure.view.x, figure.view.y, item.levels, item.mesh);
        const size = fs(theme.fontSize.tick);
        levels.forEach(({ level, lines }, k) => {
          let longest: Pt[] = [];
          const own = lines.map((_, q) => `${key}-${k}-${q}`);
          lines.forEach((line, q) => {
            const points = line.map((p) => px(p));
            prims.push({ kind: 'polyline', key: own[q]!, role: item.el.role, clip: true, points, width: 1.5, ...(item.anim ? { anim: strokeAnim(item.anim, [0, 1]) } : {}) });
            obstacles.strokes.push({ key: own[q]!, points });
            if (points.length > longest.length) longest = points;
          });
          if (item.el.labels && longest.length) {
            const mid = longest[Math.floor(longest.length / 2)]!;
            const text = formatNumber(level);
            const m = measure.text(text, size, 'math');
            const lkey = `label-${item.index}-${k}`;
            if (item.anim) labelAnims.set(lkey, { kind: 'fade', delay: item.anim.delay + item.anim.duration, duration: LABEL_FADE_MS });
            labels.push({
              req: { key: lkey, width: m.width, height: m.height, explicit: false, candidates: nudges(mid, m.width, m.height), own },
              make: (box) => textPrim(lkey, item.el.role, text, 'math', size, box),
            });
          }
        });
        setLabelAnim(item);
        if (item.el.label) {
          const first = levels.find((l) => l.lines.length)?.lines[0];
          if (first) {
            const anchorPt = px(first[Math.floor(first.length / 4)]!);
            pointLabel(item.index, item.el.label, item.el.role, anchorPt);
          }
        }
        return;
      }
      case 'mathLabel': {
        const c = px(item.at);
        const size = fs(theme.fontSize.label);
        const m = measure.tex(item.el.tex, size);
        if (item.anim) labelAnims.set(key, { kind: 'fade', delay: item.anim.delay, duration: item.anim.duration });
        labels.push({
          req: { key, width: m.width, height: m.height, explicit: false, candidates: nudges(c, m.width, m.height), fallback: ring(c[0], c[1], m.width, m.height, NOTE_RING) },
          make: (box) => ({ kind: 'mathLabel', key, role: item.el.role, clip: false, box, tex: item.el.tex, fontSize: size }),
        });
        return;
      }
    }
  }

  function functionLabel(item: Extract<Item, { type: 'function' }>, runs: Polyline[]) {
    const label = item.el.label!;
    const f = item.fn.fn;
    const [ra, rb] = item.fn.range;
    let x: number;
    const atY = typeof label.at === 'number' ? f(label.at) : NaN;
    // An x whose point is off the view would put the label at the edge, away from its curve: fall back.
    if (typeof label.at === 'number' && atY >= y0 && atY <= y1) x = label.at;
    else {
      // Default / "end": the right-most visible sample at or before 92% of the range; "start": left-most after 8%.
      const inView = runs.flat().filter(([, y]) => y >= y0 && y <= y1);
      const wantStart = label.at === 'start';
      const target = wantStart ? ra + 0.08 * (rb - ra) : ra + 0.92 * (rb - ra);
      const pick = wantStart
        ? inView.filter(([px]) => px >= target).sort((p, q) => p[0] - q[0])[0]
        : inView.filter(([px]) => px <= target).sort((p, q) => q[0] - p[0])[0];
      x = pick?.[0] ?? (ra + rb) / 2;
    }
    const y = f(x);
    if (!Number.isFinite(y)) return;
    const h = (rb - ra) * 1e-4;
    const a = px([x - h, f(x - h)]);
    const b = px([x + h, f(x + h)]);
    alongLabel(item.index, label, item.el.role, px([x, y]), [b[0] - a[0], b[1] - a[1]]);
  }

  /** Label beside a curve at an anchor, offset along the normal (upper side first). */
  function alongLabel(index: number, label: Label, role: AnyRole, p: Pt, tangent: [number, number]) {
    const len = Math.hypot(tangent[0], tangent[1]);
    const t: [number, number] = len > 0 && Number.isFinite(len) ? [tangent[0] / len, tangent[1] / len] : [1, 0];
    let n: [number, number] = [t[1], -t[0]];
    if (n[1] > 0) n = [-n[0], -n[1]];
    const gaps = [6, 12, 20, 30, 44];
    addLabel(index, label, role, (w, h) => [
      ...gaps.flatMap((g) => [boxBeside(p[0], p[1], n[0], n[1], g, w, h), boxBeside(p[0], p[1], -n[0], -n[1], g, w, h)]),
      // slide back along the curve (labels near the right edge)
      ...[24, 48].flatMap((d) => {
        const q: Pt = [p[0] - t[0] * d, p[1] - t[1] * d];
        return [boxBeside(q[0], q[1], n[0], n[1], 6, w, h), boxBeside(q[0], q[1], -n[0], -n[1], 6, w, h)];
      }),
    ], { explicitAllowed: false });
  }

  function segmentLabel(index: number, label: Label, role: AnyRole, a: Pt, b: Pt) {
    const lower = a[1] >= b[1] ? a : b;
    const upper = a[1] >= b[1] ? b : a;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d: [number, number] = [b[0] - a[0], b[1] - a[1]];
    let n: [number, number] = [d[1], -d[0]];
    if (n[1] > 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
    const pos = (typeof label.at === 'string' ? label.at : 'center') as LabelPosition;
    addLabel(index, label, role, (w, h) => {
      const below = boxAt(lower[0], lower[1] + 4, w, h, 'middle', 'top');
      const above = boxAt(upper[0], upper[1] - 4, w, h, 'middle', 'bottom');
      const left = boxAt(mid[0] - 6, mid[1], w, h, 'end', 'middle');
      const right = boxAt(mid[0] + 6, mid[1], w, h, 'start', 'middle');
      const side = [0.5, 0.75, 0.25].flatMap((k) => {
        const m: Pt = [a[0] + k * d[0], a[1] + k * d[1]];
        return [6, 14, 26].flatMap((g) => [boxBeside(m[0], m[1], n[0], n[1], g, w, h), boxBeside(m[0], m[1], -n[0], -n[1], g, w, h)]);
      });
      const startBox = boxBeside(a[0], a[1], a[0] - b[0], a[1] - b[1], 4, w, h);
      const endBox = boxBeside(b[0], b[1], b[0] - a[0], b[1] - a[1], 4, w, h);
      const order: Record<string, Rect[]> = {
        below: [below, above, ...side],
        above: [above, below, ...side],
        left: [left, right, ...side],
        right: [right, left, ...side],
        start: [startBox, endBox, ...side],
        end: [endBox, startBox, ...side],
        center: [...side, left, right, above, below],
      };
      return order[pos] ?? order.center!;
    });
  }

  function pointLabel(index: number, label: Label, role: AnyRole, c: Pt) {
    const g = theme.pointRadius + 3;
    const dirs: Record<string, [number, number]> = {
      above: [0, -1],
      below: [0, 1],
      left: [-1, 0],
      right: [1, 0],
      start: [-1, 0],
      end: [1, 0],
      center: [1, -1],
    };
    const asked = typeof label.at === 'string' && label.at !== 'center';
    const first = dirs[asked ? (label.at as string) : 'center']!;
    const rest: [number, number][] = [[1, -1], [-1, -1], [0, -1], [1, 1], [-1, 1], [0, 1], [1, 0], [-1, 0]];
    // A keyword ("below") keeps its side: straight below first, then below-right and below-left.
    const sameSide = asked ? rest.filter((d) => d[0] * first[0] + d[1] * first[1] > 0 && (d[0] !== first[0] || d[1] !== first[1])) : [];
    const all: [number, number][] = [first, ...sameSide, ...rest.filter((d) => !sameSide.includes(d))];
    addLabel(index, label, role, (w, h) => all.map(([dx, dy]) => boxBeside(c[0], c[1], dx, dy, g, w, h)), {
      keep: 1 + sameSide.length,
      fallback: (w, h) => ring(c[0], c[1], w, h, POINT_RING.map((d) => g + d)),
    });
  }

  /**
   * `explicitAllowed`: keyword placements ("below") on segments, points and regions keep their side and
   * grow the padding if needed; curve labels ("start", "end", an x value) just move to free space.
   */
  function addLabel(
    index: number,
    label: Label,
    role: AnyRole,
    candidates: (w: number, h: number, pos?: LabelPosition) => Rect[],
    { explicitAllowed = true, keep, fallback }: { explicitAllowed?: boolean; keep?: number; fallback?: (w: number, h: number) => { box: Rect }[] } = {},
  ) {
    const key = `label-${index}`;
    const explicit = explicitAllowed && typeof label.at === 'string' && label.at !== 'center';
    const extra = (w: number, h: number) => ({ ...(keep ? { keep } : {}), ...(fallback ? { fallback: fallback(w, h) } : {}) });
    if (label.tex !== undefined) {
      const size = fs(theme.fontSize.label);
      const m = measure.tex(label.tex, size);
      const boxes = candidates(m.width, m.height, typeof label.at === 'string' ? label.at : undefined);
      labels.push({
        req: { key, width: m.width, height: m.height, explicit, candidates: boxes.map((box) => ({ box })), ...extra(m.width, m.height) },
        make: (box) => ({ kind: 'mathLabel', key, role, clip: false, box, tex: label.tex!, fontSize: size }),
      });
      return;
    }
    const text = label.text!;
    const font: FontKind = /^[A-Za-z][′']*$/.test(text) ? 'mathItalic' : 'math';
    const size = fs(theme.fontSize.label);
    const m = measure.text(text, size, font);
    const boxes = candidates(m.width, m.height, typeof label.at === 'string' ? label.at : undefined);
    labels.push({
      req: { key, width: m.width, height: m.height, explicit, candidates: boxes.map((box) => ({ box })), ...extra(m.width, m.height) },
      make: (box) => textPrim(key, role, text, font, size, box),
    });
  }

  if (errors.length) return { ok: false, errors };

  // --- place labels last, against everything drawn
  const canvas: Rect = { x: 0, y: 0, width, height };
  const { placed, overflow, collisions } = placeLabels(
    labels.map((l) => l.req),
    canvas,
    obstacles,
    { clamp, explicitOverflow: MAX_EXTRA_PAD - 2 },
  );
  placed.forEach((p, i) => {
    const prim = labels[i]!.make(p.box);
    const anim = labelAnims.get(prim.key);
    prims.push(anim ? { ...prim, anim } : prim);
  });

  // Points sit above lines; labels above everything.
  const rank = (p: Primitive) =>
    p.role === 'grid' ? 0 : p.kind === 'polygon' ? 1 : p.role === 'axis' ? 2 : p.kind === 'circle' ? 4 : p.kind === 'text' || p.kind === 'mathLabel' ? 5 : 3;
  prims.sort((a, b) => rank(a) - rank(b));

  return {
    ok: true,
    overflow,
    collisions,
    scene: { width, height, plot, viewport: vp, primitives: prims, describe: figure.describe, samples, theme },
  };
}





/** The samples of one unbroken run covering exactly [from, to], or null if there's a gap. */
function sliceOne(runs: Polyline[], from: number, to: number): Polyline | null {
  const parts = slice(runs, from, to);
  if (parts.length !== 1) return null;
  const run = parts[0]!;
  if (run[0]![0] !== from || run[run.length - 1]![0] !== to) return null;
  return run;
}


/** Infinite line through p and q, clipped to the view rectangle (math coords). */
export function clipLine(p: Vec, q: Vec, xr: readonly [number, number], yr: readonly [number, number]): [Vec, Vec] | null {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = -Infinity;
  let t1 = Infinity;
  const edges: [number, number][] = [
    [-dx, p[0] - xr[0]],
    [dx, xr[1] - p[0]],
    [-dy, p[1] - yr[0]],
    [dy, yr[1] - p[1]],
  ];
  for (const [den, num] of edges) {
    if (den === 0) {
      if (num < 0) return null;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (!(t0 <= t1) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [
    [p[0] + t0 * dx, p[1] + t0 * dy],
    [p[0] + t1 * dx, p[1] + t1 * dy],
  ];
}



