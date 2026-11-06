import type { BarChart, BoxChart, ChartFigure, DotChart, HistogramChart, ScatterChart } from '../../spec/index.ts';
import { formatNumber, ticks, type PrimAnim, type Pt, type SceneOptions, type SceneResult } from '../layout.ts';
import { clipLine } from '../scene.ts';
import { boxStats, dotStacks, histogram, linearFit, niceBounds, type Bin } from '../stats.ts';
import type { AnyRole } from '../theme.ts';
import type { Rect } from '../view.ts';
import { finishLabels, fitText, makeContext, queueLabel, resolveAnim, type KindContext, type ResolvedAnim } from './common.ts';
import { approxMeasure, type Measure } from '../layout.ts';
import { ByeLightTheme } from '../theme.ts';

/** Statistics charts: bar, histogram, box plot, dot plot, scatter (with optional least-squares line). */
export function chartScene(fig: ChartFigure, opts: SceneOptions): SceneResult {
  switch (fig.type) {
    case 'bar':
      return barChart(fig, opts);
    case 'histogram':
      return histogramChart(fig, opts);
    case 'box':
      return boxChart(fig, opts);
    case 'dot':
      return dotChart(fig, opts);
    case 'scatter':
      return scatterChart(fig, opts);
  }
}

// ---------------------------------------------------------------- shared frame

interface Frame {
  ctx: KindContext;
  plot: Rect;
  anim: ResolvedAnim | undefined;
}

const tickSize = (ctx: KindContext) => Math.max(ctx.theme.fontSize.min, ctx.theme.fontSize.tick);

/** Plot rectangle inside room for the title, axis titles, tick labels. */
/** `bottomLines`: how many text lines the category / tick labels under the plot need (0 = none). */
function makeFrame(fig: ChartFigure, opts: SceneOptions, defaultAspect: number, leftLabels: string[], bottomLines: boolean | number, fixedHeight?: number): Frame {
  const ctx = makeContext(opts, defaultAspect, fig.aspect, fixedHeight);
  const ts = tickSize(ctx);
  const leftW = Math.max(0, ...leftLabels.map((t) => ctx.measure.text(t, ts, 'note').width));
  const top = 8 + (fig.title ? 24 : 0) + (fig.axes?.y ? 18 : 0);
  const lines = bottomLines === true ? 1 : bottomLines === false ? 0 : bottomLines;
  const bottom = 6 + lines * 16 + (lines ? 2 : 0) + (fig.axes?.x ? 20 : 0);
  const left = 8 + (leftW ? leftW + 6 : 0);
  const plot: Rect = { x: left, y: top, width: ctx.width - left - 12, height: ctx.height - top - bottom };
  const anim = resolveAnim(fig.animate, fig.type === 'bar' || fig.type === 'histogram' ? 'grow' : 'fade', ['grow', 'fade', 'draw'], '', ctx.errors, 'a chart');

  if (fig.title) {
    queueLabel(ctx, 'title', { text: fig.title }, 'text', (w, h) => [{ x: ctx.width / 2 - w / 2, y: 6, width: w, height: h }], { font: 'note', size: ctx.theme.fontSize.label });
  }
  if (fig.axes?.y) {
    queueLabel(ctx, 'axis-title-y', { text: fig.axes.y }, 'note', (w, h) => [{ x: Math.max(2, plot.x - 4), y: plot.y - h - 4, width: w, height: h }], { font: 'note', size: ctx.theme.fontSize.note });
  }
  if (fig.axes?.x) {
    queueLabel(ctx, 'axis-title-x', { text: fig.axes.x }, 'note', (w, h) => [{ x: plot.x + plot.width / 2 - w / 2, y: ctx.height - h - 4, width: w, height: h }], { font: 'note', size: ctx.theme.fontSize.note });
  }
  return { ctx, plot, anim };
}

/** Horizontal gridlines with value labels on the left. */
function yAxis({ ctx, plot }: Frame, [y0, y1, step]: [number, number, number], yToPx: (v: number) => number) {
  for (const v of ticks(y0, y1, step)) {
    const y = yToPx(v);
    ctx.prims.push({ kind: 'line', key: `ygrid-${v}`, role: v === 0 ? 'axis' : 'grid', clip: false, from: [plot.x, y], to: [plot.x + plot.width, y] });
    queueLabel(ctx, `ytick-${v}`, { text: formatNumber(v) }, 'note', (w, h) => [{ x: plot.x - 6 - w, y: y - h / 2, width: w, height: h }], { font: 'math', size: tickSize(ctx) });
  }
  ctx.prims.push({ kind: 'line', key: 'yaxis', role: 'axis', clip: false, from: [plot.x, plot.y], to: [plot.x, plot.y + plot.height] });
}

/** Axis line at the bottom with ticks and value labels. */
function xAxis({ ctx, plot }: Frame, values: number[], xToPx: (v: number) => number, label = formatNumber) {
  const y = plot.y + plot.height;
  ctx.prims.push({ kind: 'line', key: 'xaxis', role: 'axis', clip: false, from: [plot.x, y], to: [plot.x + plot.width, y] });
  const ts = tickSize(ctx);
  const widest = Math.max(0, ...values.map((v) => ctx.measure.text(label(v), ts, 'math').width));
  const gap = values.length > 1 ? Math.abs(xToPx(values[1]!) - xToPx(values[0]!)) : Infinity;
  const every = widest + 6 > gap ? Math.ceil((widest + 6) / gap) : 1;
  values.forEach((v, k) => {
    const x = xToPx(v);
    ctx.prims.push({ kind: 'line', key: `xtick-${k}`, role: 'axis', clip: false, from: [x, y], to: [x, y + 4] });
    if (k % every === 0) queueLabel(ctx, `xtick-label-${k}`, { text: label(v) }, 'note', (w, h) => [{ x: x - w / 2, y: y + 5, width: w, height: h }], { font: 'math', size: ts });
  });
}

function finish(fr: Frame, describe: string): SceneResult {
  const { ctx, plot } = fr;
  if (ctx.errors.length) return { ok: false, errors: ctx.errors };
  finishLabels(ctx);
  return {
    ok: true,
    scene: {
      width: ctx.width,
      height: ctx.height,
      plot,
      viewport: { x: [0, 1], y: [0, 1], width: ctx.width, height: ctx.height, padding: { top: plot.y, left: plot.x, right: ctx.width - plot.x - plot.width, bottom: ctx.height - plot.y - plot.height } },
      primitives: ctx.prims,
      describe,
      samples: {},
      theme: ctx.theme,
    },
  };
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const stagger = (a: ResolvedAnim | undefined, i: number, step: number, kind: 'grow' | 'fade', baseline = 0): PrimAnim | undefined => {
  if (!a) return undefined;
  const delay = a.delay + i * step;
  return a.kind === 'grow' && kind === 'grow' ? { kind: 'grow', delay, duration: a.duration, baseline } : { kind: 'fade', delay, duration: a.duration };
};
const withAnim = (a: PrimAnim | undefined) => (a ? { anim: a } : {});

// ---------------------------------------------------------------- bar

function barChart(fig: BarChart, opts: SceneOptions): SceneResult {
  const values = fig.bars.map((b) => b.value);
  const lo = Math.min(0, ...values);
  const hiRaw = Math.max(0, ...values);
  const [y0, niceHi, step] = niceBounds(lo, fig.max ?? hiRaw);
  const y1 = fig.max ?? niceHi;
  const yLabels = ticks(y0, y1, step).map(formatNumber);
  // Category labels: wrap to two lines and shrink to the minimum size if needed, so they never overlap.
  const theme = opts.theme ?? ByeLightTheme;
  const measure: Measure = { ...approxMeasure, ...opts.measure };
  const ts = Math.max(theme.fontSize.min, theme.fontSize.tick);
  const leftW = Math.max(0, ...yLabels.map((t) => measure.text(t, ts, 'note').width));
  const slotEstimate = (opts.width - (8 + leftW + 6) - 12) / fig.bars.length;
  const fitted = fig.bars.map((b) => fitText(b.label, slotEstimate * 0.94, ts, theme.fontSize.min, measure, 'note', 3));
  const lineCount = Math.max(1, ...fitted.map((f) => f.lines.length));
  const fr = makeFrame(fig, opts, 4 / 3, yLabels, lineCount);
  const { ctx, plot, anim } = fr;
  const yToPx = (v: number) => plot.y + plot.height - ((v - y0) / (y1 - y0)) * plot.height;
  yAxis(fr, [y0, y1, step], yToPx);
  const slot = plot.width / fig.bars.length;
  const base = yToPx(0);
  fig.bars.forEach((b, i) => {
    const cx = plot.x + slot * (i + 0.5);
    const half = (slot * 0.62) / 2;
    const top = yToPx(b.value);
    const role = (b.role ?? 'f') as AnyRole;
    ctx.prims.push({ kind: 'polygon', key: `bar-${i}`, role, clip: false, points: rect(cx - half, base, cx + half, top), fillOpacity: 0.3, outline: true, ...withAnim(stagger(anim, i, 90, 'grow', base)) });
    const f = fitted[i]!;
    f.lines.forEach((line, li) => {
      const lineH = f.size * 1.2;
      queueLabel(ctx, li === 0 ? `bar-label-${i}` : `bar-label-${i}-${li}`, { text: line }, 'note', (w, h) => [{ x: cx - w / 2, y: plot.y + plot.height + 5 + li * lineH, width: w, height: h }], { font: 'note', size: f.size });
    });
  });
  return finish(fr, fig.describe);
}

// ---------------------------------------------------------------- histogram

function histogramChart(fig: HistogramChart, opts: SceneOptions): SceneResult {
  let bins: Bin[];
  try {
    bins = Array.isArray(fig.bins) ? fig.bins : histogram(fig.data!, fig.bins);
  } catch (e) {
    return { ok: false, errors: [{ path: 'bins', message: String((e as Error).message) }] };
  }
  if (bins.some((b, i) => !(b.from < b.to) || (i > 0 && b.from !== bins[i - 1]!.to))) {
    return { ok: false, errors: [{ path: 'bins', message: 'bins must be increasing and touch each other (each "from" equals the previous "to")' }] };
  }
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const [, yTop, rawStep] = niceBounds(0, maxCount);
  const step = Math.max(1, Math.round(rawStep));
  const y1 = Math.max(yTop, Math.ceil(maxCount / step) * step);
  const fr = makeFrame(fig, opts, 4 / 3, ticks(0, y1, step).map(formatNumber), true);
  const { ctx, plot, anim } = fr;
  const x0 = bins[0]!.from;
  const x1 = bins[bins.length - 1]!.to;
  const xToPx = (v: number) => plot.x + ((v - x0) / (x1 - x0)) * plot.width;
  const yToPx = (v: number) => plot.y + plot.height - (v / y1) * plot.height;
  yAxis(fr, [0, y1, step], yToPx);
  const base = yToPx(0);
  bins.forEach((b, i) => {
    if (b.count === 0) return;
    ctx.prims.push({ kind: 'polygon', key: `bin-${i}`, role: 'f', clip: false, points: rect(xToPx(b.from), base, xToPx(b.to), yToPx(b.count)), fillOpacity: 0.3, outline: true, ...withAnim(stagger(anim, i, 70, 'grow', base)) });
  });
  const edges = [x0, ...bins.map((b) => b.to)];
  xAxis(fr, edges.length <= 13 ? edges : ticks(x0, x1, niceBounds(x0, x1)[2]), xToPx);
  return finish(fr, fig.describe);
}

// ---------------------------------------------------------------- box plot

function boxChart(fig: BoxChart, opts: SceneOptions): SceneResult {
  const stats = fig.groups.map((g) => boxStats(g.data, fig.quartiles));
  const all = fig.groups.flatMap((g) => g.data);
  const [lo, hi, step] = fig.range ? [fig.range[0], fig.range[1], niceBounds(fig.range[0], fig.range[1])[2]] : niceBounds(Math.min(...all), Math.max(...all), 0.04);
  const labels = fig.groups.map((g) => g.label ?? '');
  const fr = makeFrame(fig, opts, 1, labels.filter(Boolean), true, 64 + fig.groups.length * 54 + (fig.title ? 24 : 0) + (fig.axes?.x ? 20 : 0));
  const { ctx, plot, anim } = fr;
  const xToPx = (v: number) => plot.x + ((v - lo) / (hi - lo)) * plot.width;
  const rowH = plot.height / fig.groups.length;
  for (const v of ticks(lo, hi, step)) ctx.prims.push({ kind: 'line', key: `xgrid-${v}`, role: 'grid', clip: false, from: [xToPx(v), plot.y], to: [xToPx(v), plot.y + plot.height] });
  stats.forEach((s, i) => {
    const cy = plot.y + rowH * (i + 0.5);
    const bh = Math.min(28, rowH * 0.5);
    const a = withAnim(stagger(anim, i, 150, 'fade'));
    const k = `g${i}`;
    ctx.prims.push({ kind: 'polygon', key: `${k}-box`, role: 'f', clip: false, points: rect(xToPx(s.q1), cy - bh / 2, xToPx(s.q3), cy + bh / 2), fillOpacity: 0.16, outline: true, ...a });
    ctx.prims.push({ kind: 'line', key: `${k}-median`, role: 'f', clip: false, from: [xToPx(s.median), cy - bh / 2], to: [xToPx(s.median), cy + bh / 2], width: 2.5, ...a });
    ctx.prims.push({ kind: 'line', key: `${k}-wl`, role: 'f', clip: false, from: [xToPx(s.low), cy], to: [xToPx(s.q1), cy], width: 1.5, ...a });
    ctx.prims.push({ kind: 'line', key: `${k}-wh`, role: 'f', clip: false, from: [xToPx(s.q3), cy], to: [xToPx(s.high), cy], width: 1.5, ...a });
    ctx.prims.push({ kind: 'line', key: `${k}-cl`, role: 'f', clip: false, from: [xToPx(s.low), cy - bh / 4], to: [xToPx(s.low), cy + bh / 4], width: 1.5, ...a });
    ctx.prims.push({ kind: 'line', key: `${k}-ch`, role: 'f', clip: false, from: [xToPx(s.high), cy - bh / 4], to: [xToPx(s.high), cy + bh / 4], width: 1.5, ...a });
    s.outliers.forEach((o, j) => ctx.prims.push({ kind: 'circle', key: `${k}-o${j}`, role: 'bound', clip: false, center: [xToPx(o), cy], r: 3.5, hollow: true, ...a }));
    if (labels[i]) queueLabel(ctx, `${k}-label`, { text: labels[i]! }, 'note', (w, h) => [{ x: plot.x - 6 - w, y: cy - h / 2, width: w, height: h }], { font: 'note', size: tickSize(ctx) });
  });
  xAxis(fr, ticks(lo, hi, step), xToPx);
  return finish(fr, fig.describe);
}

// ---------------------------------------------------------------- dot plot

function dotChart(fig: DotChart, opts: SceneOptions): SceneResult {
  const step = fig.step ?? 1;
  const stacks = dotStacks(fig.data, step);
  const values = stacks.map((s) => s[0]);
  const [lo, hi] = fig.range ?? [Math.min(...values) - step, Math.max(...values) + step];
  const maxStack = Math.max(...stacks.map((s) => s[1]));
  const W = opts.width;
  const pxPerStep = ((W - 24) / (hi - lo)) * step;
  const r = Math.max(2.5, Math.min(6, pxPerStep * 0.38));
  const height = 8 + (fig.title ? 24 : 0) + maxStack * (2 * r + 2) + 12 + 24 + (fig.axes?.x ? 20 : 0);
  const fr = makeFrame(fig, opts, 1, [], true, Math.max(100, height));
  const { ctx, plot, anim } = fr;
  const xToPx = (v: number) => plot.x + ((v - lo) / (hi - lo)) * plot.width;
  const axisY = plot.y + plot.height;
  let n = 0;
  stacks.forEach(([v, count]) => {
    for (let k = 0; k < count; k++) {
      ctx.prims.push({ kind: 'circle', key: `dot-${v}-${k}`, role: 'f', clip: false, center: [xToPx(v), axisY - r - 3 - k * (2 * r + 2)], r, ...withAnim(stagger(anim, n++, 40, 'fade')) });
    }
  });
  // Padding beyond the data is drawn but not labelled (no "−1 siblings").
  const [tlo, thi] = fig.range ?? [Math.min(...values), Math.max(...values)];
  const tickStep = (thi - tlo) / step <= 20 ? step : niceBounds(tlo, thi)[2];
  xAxis(fr, ticks(tlo, thi, tickStep), xToPx);
  return finish(fr, fig.describe);
}

// ---------------------------------------------------------------- scatter

function scatterChart(fig: ScatterChart, opts: SceneOptions): SceneResult {
  const xs = fig.points.map((p) => p[0]);
  const ys = fig.points.map((p) => p[1]);
  const [x0, x1, xStep] = fig.view ? [fig.view.x[0], fig.view.x[1], niceBounds(fig.view.x[0], fig.view.x[1])[2]] : niceBounds(Math.min(...xs), Math.max(...xs), 0.05);
  const [y0, y1, yStep] = fig.view ? [fig.view.y[0], fig.view.y[1], niceBounds(fig.view.y[0], fig.view.y[1])[2]] : niceBounds(Math.min(...ys), Math.max(...ys), 0.08);
  const fr = makeFrame(fig, opts, 4 / 3, ticks(y0, y1, yStep).map(formatNumber), true);
  const { ctx, plot, anim } = fr;
  const xToPx = (v: number) => plot.x + ((v - x0) / (x1 - x0)) * plot.width;
  const yToPx = (v: number) => plot.y + plot.height - ((v - y0) / (y1 - y0)) * plot.height;
  yAxis(fr, [y0, y1, yStep], yToPx);
  for (const v of ticks(x0, x1, xStep)) ctx.prims.push({ kind: 'line', key: `xgrid-${v}`, role: 'grid', clip: false, from: [xToPx(v), plot.y], to: [xToPx(v), plot.y + plot.height] });
  fig.points.forEach(([x, y], i) => {
    const c: Pt = [xToPx(x), yToPx(y)];
    ctx.prims.push({ kind: 'circle', key: `pt-${i}`, role: 'f', clip: false, center: c, r: 3.5, ...withAnim(stagger(anim, i, 40, 'fade')) });
    ctx.obstacles.points.push({ x: c[0], y: c[1], r: 3.5 });
  });
  if (fig.fit === 'linear') {
    let fit;
    try {
      fit = linearFit(fig.points);
    } catch (e) {
      return { ok: false, errors: [{ path: 'fit', message: String((e as Error).message) }] };
    }
    const seg = clipLine([0, fit.intercept], [1, fit.intercept + fit.slope], [x0, x1], [y0, y1]);
    if (seg) {
      const a: Pt = [xToPx(seg[0][0]), yToPx(seg[0][1])];
      const b: Pt = [xToPx(seg[1][0]), yToPx(seg[1][1])];
      const lineAnim: PrimAnim | undefined = anim ? { kind: 'draw', delay: anim.delay + fig.points.length * 40, duration: anim.duration, span: [0, 1] } : undefined;
      ctx.prims.push({ kind: 'line', key: 'fit', role: 'bound', clip: false, from: a, to: b, ...withAnim(lineAnim) });
      ctx.obstacles.strokes.push({ key: 'fit', points: [a, b] });
      if (fig.showEquation ?? true) {
        const sig = (v: number) => +v.toPrecision(3);
        const m = sig(fit.slope);
        const c = sig(fit.intercept);
        const tex = `y = ${m}x ${c < 0 ? '-' : '+'} ${Math.abs(c)}${Number.isNaN(fit.r) ? '' : `,\\; r = ${fit.r.toFixed(2)}`}`;
        const labelAnim: PrimAnim | undefined = lineAnim && lineAnim.kind === 'draw' ? { kind: 'fade', delay: lineAnim.delay + lineAnim.duration, duration: 250 } : undefined;
        queueLabel(ctx, 'fit-label', { tex }, 'bound', (w, h) => [
          { x: plot.x + 6, y: plot.y + 4, width: w, height: h },
          { x: plot.x + plot.width - w - 4, y: plot.y + plot.height - h - 4, width: w, height: h },
          { x: plot.x + plot.width - w - 4, y: plot.y + 4, width: w, height: h },
          { x: plot.x + 6, y: plot.y + plot.height - h - 4, width: w, height: h },
        ], withAnim(labelAnim));
      }
    }
  }
  xAxis(fr, ticks(x0, x1, xStep), xToPx);
  return finish(fr, fig.describe);
}
