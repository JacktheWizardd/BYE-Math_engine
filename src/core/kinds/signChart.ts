import { ExprError, parseExpr, parseRaw, toTex, type FunctionTable, type Node, type RawNode } from '../../expr/index.ts';
import type { FigureIssue, SignChartFigure } from '../../spec/index.ts';
import { makeFunctionTable } from '../fnTable.ts';
import { formatValue, snap } from '../format.ts';
import type { PrimAnim, SceneOptions, SceneResult } from '../layout.ts';
import { analyzeSign, SignError, type SignAnalysis } from '../sign.ts';
import { arrowHead, constValue, exprMessage, finishLabels, makeContext, queueLabel, resolveAnim } from './common.ts';

const HEADER_ROW = 32;
const HEADER_TIER = 23;
const ROW_H = 34;
/** Columns narrower than this are hard to read on a phone: the chart scrolls sideways instead. */
const MIN_COL = 30;
/** Column width when scrolling. */
const SCROLL_COL = 44;
/** A sanity bound: more than this many columns means "range" should be narrowed. */
const MAX_POINTS = 40;

interface Row {
  path: string;
  raw: RawNode;
  node: Node;
  show: 'sign' | 'trend';
  label: string;
  analysis: SignAnalysis;
}

/**
 * Sign chart: one row per expression, columns at every critical point (equally
 * spaced, as in textbooks), +/− per interval, 0 or ‖ at critical points, and
 * ↗/↘ trend rows (with max/min) for the first-derivative test.
 */
export function signChartScene(fig: SignChartFigure, opts: SceneOptions): SceneResult {
  const v = fig.variable;
  const range = fig.range ?? [-50, 50];
  const errors: FigureIssue[] = [];

  // --- named functions (f, then f', f'' in rows)
  const fnIds = Object.keys(fig.functions ?? {});
  const defs = new Map<string, Node>();
  for (const [id, src] of Object.entries(fig.functions ?? {})) {
    try {
      defs.set(id, parseExpr(src, { variables: [v], functions: fnIds }));
    } catch (e) {
      errors.push({ path: `functions.${id}`, message: exprMessage(e) });
    }
  }
  const table: FunctionTable = makeFunctionTable(defs);

  // --- rows: explicit, or factors then f
  const specs: { path: string; expr: string; show: 'sign' | 'trend'; label?: string }[] = fig.rows
    ? fig.rows.map((r, i) => (typeof r === 'string' ? { path: `rows[${i}]`, expr: r, show: 'sign' } : { path: `rows[${i}]`, expr: r.expr, show: r.show, ...(r.label ? { label: r.label } : {}) }))
    : [...(fig.factors ?? []).map((expr, i) => ({ path: `factors[${i}]`, expr, show: 'sign' as const })), { path: 'f', expr: fig.f!, show: 'sign' as const }];

  const rows: Row[] = [];
  for (const s of specs) {
    try {
      const raw = parseRaw(s.expr);
      const node = parseExpr(s.expr, { variables: [v], functions: fnIds });
      const analysis = analyzeSign(node, table, range);
      rows.push({ path: s.path, raw, node, show: s.show, label: s.label ?? defaultLabel(raw, s.show), analysis });
    } catch (e) {
      const msg = e instanceof ExprError ? e.describe() : e instanceof SignError ? `${s.expr}: ${e.message}` : exprMessage(e);
      errors.push({ path: s.path, message: msg });
    }
  }
  if (errors.length) return { ok: false, errors };

  // --- shared columns: every row's critical points
  const xs: number[] = [];
  for (const r of rows) for (const p of r.analysis.points) if (!xs.some((x) => Math.abs(x - p.x) < 1e-7 * Math.max(1, Math.abs(x)))) xs.push(p.x);
  xs.sort((p, q) => p - q);
  if (xs.length > MAX_POINTS) {
    return { ok: false, errors: [{ path: 'range', message: `${xs.length} critical points in [${range[0]}, ${range[1]}]; a sign chart shows at most ${MAX_POINTS}. Set a narrower "range".` }] };
  }
  const marks = new Map<number, string>();
  (fig.marks ?? []).forEach((m, i) => {
    const mx = snap(constValue(m.x, `marks[${i}].x`, errors));
    const hit = xs.find((x) => Math.abs(x - mx) < 1e-9 * Math.max(1, Math.abs(x)));
    if (hit === undefined && Number.isFinite(mx)) errors.push({ path: `marks[${i}].x`, message: `${formatValue(mx).text} isn't a critical point of this chart` });
    else if (hit !== undefined) marks.set(hit, m.tex);
  });
  if (errors.length) return { ok: false, errors };

  // --- geometry
  const ctx = makeContext(opts, 1, undefined, 1);
  const { width: W, theme, prims, measure } = ctx;
  const size = Math.max(theme.fontSize.min, theme.fontSize.label);
  // Heading column: at most a third of the width; wider headings are drawn smaller (down to the minimum size).
  const maxLeft = W / 3;
  const headingSize = rows.map((r) => {
    const w = measure.tex(r.label, size).width;
    return w + 18 > maxLeft ? Math.max(theme.fontSize.min, (size * (maxLeft - 18)) / w) : size;
  });
  const labelW = Math.max(measure.text(v, size, 'mathItalic').width, ...rows.map((r, i) => measure.tex(r.label, headingSize[i]!).width));
  const left = Math.min(maxLeft, Math.max(56, labelW + 18));
  const cols = xs.length + 1;
  // Too many columns to read at this width: the chart gets wider and scrolls sideways,
  // with the heading column frozen on the left (see ByeFigure).
  const scrolls = (W - 6 - left) / cols < MIN_COL;
  // When scrolling, width is free: make columns wide enough for every header value on one row.
  const widestHead = Math.max(0, ...xs.map((x) => measure.tex(marks.get(x) ?? formatValue(x).tex, size).width));
  const infWidth = Math.max(measure.tex('-\\infty', size).width, measure.tex('+\\infty', size).width);
  const firstLast = [xs[0], xs[xs.length - 1]].map((x) => (x === undefined ? 0 : measure.tex(marks.get(x) ?? formatValue(x).tex, size).width));
  const colW = scrolls ? Math.max(SCROLL_COL, widestHead + 14, 4 + infWidth + Math.max(...firstLast) / 2 + 8) : (W - 6 - left) / cols;
  const contentW = scrolls ? left + cols * colW + 6 : W;
  ctx.width = contentW;
  const right = contentW - 6;
  const bx = (k: number) => left + (k + 1) * colW; // x of critical point k

  // Header values: one size for all, as large as fits the column. If they still don't fit side by side,
  // stagger them on two rows (each then has two columns of room); ±∞ go on the row their neighbour doesn't use.
  const headTex = xs.map((x) => marks.get(x) ?? formatValue(x).tex);
  const infW = Math.max(measure.tex('-\\infty', size).width, measure.tex('+\\infty', size).width);
  const fitSize = (room: number) =>
    Math.min(size, ...headTex.map((t) => {
      const w = measure.tex(t, size).width;
      return w > room ? Math.max(theme.fontSize.min, (size * room) / w) : size;
    }));
  let headSize = fitSize(colW * 0.92);
  const widest = Math.max(0, ...headTex.map((t) => measure.tex(t, headSize).width));
  const infClash = xs.length > 0 && (4 + infW > colW - measure.tex(headTex[0]!, headSize).width / 2 - 3 || infW > colW - measure.tex(headTex[xs.length - 1]!, headSize).width / 2 - 3);
  const twoTiers = widest > colW * 0.92 || infClash;
  if (twoTiers) headSize = fitSize(colW * 1.84);
  const HEADER_H = twoTiers ? HEADER_ROW + HEADER_TIER : HEADER_ROW;
  const tierY = (tier: number) => (twoTiers ? 15 + tier * HEADER_TIER : HEADER_ROW / 2);
  ctx.height = HEADER_H + rows.length * ROW_H + 2;
  const H = ctx.height;
  const rowY = (r: number) => HEADER_H + r * ROW_H; // top of row r

  const anim = resolveAnim(fig.animate, 'fade', ['fade'], '', errors, 'a sign chart');
  const rowAnim = (r: number): PrimAnim | undefined => (anim ? { kind: 'fade', delay: anim.delay + r * anim.duration, duration: anim.duration } : undefined);
  const withAnim = (a: PrimAnim | undefined) => (a ? { anim: a } : {});

  // frame lines
  prims.push({ kind: 'line', key: 'head-line', role: 'axis', clip: false, from: [0, HEADER_H], to: [contentW, HEADER_H] });
  prims.push({ kind: 'line', key: 'left-line', role: 'axis', clip: false, from: [left, 2], to: [left, H] });
  rows.forEach((_, r) => {
    if (r > 0) prims.push({ kind: 'line', key: `row-line-${r}`, role: 'grid', clip: false, from: [0, rowY(r)], to: [contentW, rowY(r)] });
  });
  xs.forEach((_, k) => prims.push({ kind: 'line', key: `col-${k}`, role: 'grid', clip: false, from: [bx(k), HEADER_H], to: [bx(k), H], dash: [3, 3] }));

  // header: variable, −∞, critical values, +∞
  const cell = (cx: number, cy: number) => (w: number, h: number) => [{ x: cx - w / 2, y: cy - h / 2, width: w, height: h }];
  const tierOf = (k: number) => (twoTiers ? k % 2 : 0);
  // ±∞ go on the row where their nearest neighbour leaves the most room.
  const room = (side: 'left' | 'right', tier: number) => {
    const ks = xs.map((_, k) => k).filter((k) => tierOf(k) === tier);
    if (!ks.length) return Infinity;
    const k = side === 'left' ? ks[0]! : ks[ks.length - 1]!;
    const w = measure.tex(headTex[k]!, headSize).width;
    return side === 'left' ? bx(k) - w / 2 - (left + 4 + infW) : right - infW - (bx(k) + w / 2);
  };
  const minfTier = twoTiers && room('left', 1) > room('left', 0) ? 1 : 0;
  const pinfTier = twoTiers && room('right', 1) > room('right', 0) ? 1 : 0;
  /** ±∞ shrink (down to the minimum size) when their neighbour leaves less room than they need. */
  const infSize = (r: number) => (r >= 3 ? headSize : Math.max(theme.fontSize.min, (headSize * Math.max(1, infW + r - 3)) / infW));
  const minfSize = infSize(room('left', minfTier));
  const pinfSize = infSize(room('right', pinfTier));
  queueLabel(ctx, 'head-var', { text: v }, 'text', cell(left / 2, HEADER_H / 2), { font: 'mathItalic' });
  queueLabel(ctx, 'head-minf', { tex: '-\\infty' }, 'text', (w, h) => [{ x: left + 4, y: tierY(minfTier) - h / 2, width: w, height: h }], { size: minfSize });
  queueLabel(ctx, 'head-pinf', { tex: '+\\infty' }, 'text', (w, h) => [{ x: right - w, y: tierY(pinfTier) - h / 2, width: w, height: h }], { size: pinfSize });
  xs.forEach((_, k) => queueLabel(ctx, `head-${k}`, { tex: headTex[k]! }, 'text', cell(bx(k), tierY(tierOf(k))), { size: headSize }));

  // rows
  rows.forEach((row, r) => {
    const cy = rowY(r) + ROW_H / 2;
    const a = rowAnim(r);
    queueLabel(ctx, `row-label-${r}`, { tex: row.label }, 'text', cell(left / 2, cy), { size: headingSize[r]!, ...withAnim(a) });
    // value at each column boundary
    xs.forEach((x, k) => {
      const pt = row.analysis.points.find((p) => Math.abs(p.x - x) < 1e-7 * Math.max(1, Math.abs(x)));
      if (!pt) return;
      if (pt.value === 'undefined') {
        for (const d of [-2, 2]) prims.push({ kind: 'line', key: `r${r}-u${k}${d}`, role: 'bound', clip: false, from: [bx(k) + d, rowY(r) + 4], to: [bx(k) + d, rowY(r) + ROW_H - 4], width: 1.5, ...withAnim(a) });
      } else if (row.show === 'sign') {
        queueLabel(ctx, `r${r}-z${k}`, { text: '0' }, 'text', cell(bx(k), cy), { font: 'math', ...withAnim(a) });
      } else {
        const before = signAt(row.analysis, x - 1e-6 * Math.max(1, Math.abs(x)));
        const after = signAt(row.analysis, x + 1e-6 * Math.max(1, Math.abs(x)));
        const word = before === 1 && after === -1 ? 'max' : before === -1 && after === 1 ? 'min' : null;
        if (word) queueLabel(ctx, `r${r}-z${k}`, { text: word }, 'note', cell(bx(k), rowY(r) + ROW_H - 8), { font: 'note', size: theme.fontSize.note, ...withAnim(a) });
      }
    });
    // each interval
    for (let j = 0; j < cols; j++) {
      const x0 = left + j * colW;
      const x1 = x0 + colW;
      const cx = (x0 + x1) / 2;
      const iv = row.analysis.intervals.find((i) => {
        const mid = j === 0 ? (xs[0] ?? 0) - 1 : j === cols - 1 ? xs[cols - 2]! + 1 : (xs[j - 1]! + xs[j]!) / 2;
        return mid > i.from && mid < i.to;
      });
      const sign = iv?.sign ?? null;
      if (sign === null) {
        prims.push({ kind: 'polygon', key: `r${r}-c${j}`, role: 'note', clip: false, fillOpacity: 0.1, points: [[x0 + 2, rowY(r) + 3], [x1 - 2, rowY(r) + 3], [x1 - 2, rowY(r) + ROW_H - 3], [x0 + 2, rowY(r) + ROW_H - 3]], ...withAnim(a) });
        continue;
      }
      if (row.show === 'sign') {
        const text = sign === 1 ? '+' : sign === -1 ? '−' : '0';
        queueLabel(ctx, `r${r}-c${j}`, { text }, sign === 1 ? 'F' : sign === -1 ? 'bound' : 'text', cell(cx, cy), { font: 'math', size: size + 3, ...withAnim(a) });
      } else {
        const dx = Math.min(16, colW * 0.3);
        const dy = sign === 0 ? 0 : sign === 1 ? -6 : 6;
        const ay = cy - 4; // a little above centre, leaving room for "max" / "min" below
        const from: [number, number] = [cx - dx, ay - dy];
        const to: [number, number] = [cx + dx, ay + dy];
        const head = arrowHead(to[0], to[1], to[0] - from[0], to[1] - from[1], 7);
        prims.push({ kind: 'line', key: `r${r}-c${j}`, role: 'f', clip: false, from, to: [to[0] - (to[0] - from[0]) * 0.15, to[1] - (to[1] - from[1]) * 0.15], width: 2, ...withAnim(a) });
        prims.push({ kind: 'polygon', key: `r${r}-h${j}`, role: 'f', clip: false, points: head, fillOpacity: 1, ...withAnim(a) });
      }
    }
  });

  if (errors.length) return { ok: false, errors };
  finishLabels(ctx);
  return {
    ok: true,
    scene: {
      width: contentW,
      height: H,
      plot: { x: 0, y: 0, width: contentW, height: H },
      viewport: { x: [range[0], range[1]], y: [0, 1], width: contentW, height: H, padding: { top: 0, bottom: 0, left, right: contentW - right } },
      primitives: prims,
      describe: fig.describe,
      samples: {},
      theme,
      ...(scrolls ? { scroll: { viewportWidth: W, frozenWidth: left } } : {}),
    },
  };
}

function signAt(a: SignAnalysis, x: number) {
  return a.intervals.find((i) => x > i.from && x < i.to)?.sign ?? null;
}

/** Default row heading: the expression in TeX; a trend row driven by f'(x) is labelled f. */
function defaultLabel(raw: RawNode, show: 'sign' | 'trend'): string {
  if (show === 'trend' && raw.type === 'apply' && raw.order > 0) return `${raw.callee}${"'".repeat(raw.order - 1)}`;
  return toTex(raw);
}
