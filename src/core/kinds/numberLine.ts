import { ExprError } from '../../expr/index.ts';
import type { NumberLineFigure } from '../../spec/index.ts';
import { formatValue } from '../format.ts';
import { solveInequality, type SolutionSet } from '../inequality.ts';
import { niceStep, ticks, type PrimAnim, type SceneOptions, type SceneResult } from '../layout.ts';
import { SignError } from '../sign.ts';
import type { AnyRole } from '../theme.ts';
import { aboveBelow, afterOf, arrowHead, constValue, exprMessage, fadeOf, finishLabels, makeContext, queueLabel, resolveAnim, type ResolvedAnim } from './common.ts';

const DEFAULT_ASPECT = 3.3;
const PAD_X = 18;
const SOLUTION_WIDTH = 4.5;
const DOT_R = 5;

/** A number line with solution sets of inequalities, intervals, points and notes. */
export function numberLineScene(fig: NumberLineFigure, opts: SceneOptions): SceneResult {
  const ctx = makeContext(opts, DEFAULT_ASPECT, fig.aspect);
  const { width: W, height: H, theme, errors, prims, obstacles } = ctx;
  const [a, b] = fig.range;
  const span = b - a;
  const lineY = Math.round(H * 0.6);
  const px = (x: number) => PAD_X + ((x - a) / span) * (W - 2 * PAD_X);
  const at = (i: number, f?: string) => `elements[${i}]${f ? `.${f}` : ''}`;

  // --- axis with arrows at both ends, ticks and tick labels
  prims.push({ kind: 'line', key: 'axis', role: 'axis', clip: false, from: [4, lineY], to: [W - 4, lineY] });
  prims.push({ kind: 'polygon', key: 'axis-left', role: 'axis', clip: false, points: arrowHead(2, lineY, -1, 0, 6), fillOpacity: 1 });
  prims.push({ kind: 'polygon', key: 'axis-right', role: 'axis', clip: false, points: arrowHead(W - 2, lineY, 1, 0, 6), fillOpacity: 1 });
  obstacles.axes.push([[0, lineY], [W, lineY]]);
  const step = fig.ticks ?? niceStep(span);
  const tickVals = ticks(a, b, step);
  const tickSize = Math.max(theme.fontSize.min, theme.fontSize.tick);
  const widest = Math.max(0, ...tickVals.map((v) => ctx.measure.text(formatValue(v).text, tickSize, 'math').width));
  const spacing = tickVals.length > 1 ? px(tickVals[1]!) - px(tickVals[0]!) : Infinity;
  const every = widest + 4 > spacing ? Math.ceil((widest + 4) / spacing) : 1;
  tickVals.forEach((v, k) => {
    const x = px(v);
    prims.push({ kind: 'line', key: `tick-${k}`, role: 'axis', clip: false, from: [x, lineY - 5], to: [x, lineY + 5] });
    if (fig.tickLabels && k % every === 0) {
      queueLabel(ctx, `tick-label-${k}`, { text: formatValue(v).text }, 'note', (w, h) => [{ x: x - w / 2, y: lineY + 8, width: w, height: h }], {
        font: 'math',
        size: tickSize,
      });
    }
  });

  // --- elements
  fig.elements.forEach((el, i) => {
    const key = `el-${i}`;
    const role = el.role as AnyRole;
    switch (el.type) {
      case 'inequality':
      case 'interval': {
        let set: SolutionSet = [];
        if (el.type === 'inequality') {
          try {
            set = solveInequality(el.expr, fig.variable, [a - 10 * span, b + 10 * span]);
          } catch (e) {
            const msg = e instanceof ExprError ? e.describe() : e instanceof SignError ? e.message : exprMessage(e);
            errors.push({ path: at(i, 'expr'), message: msg });
            return;
          }
        } else {
          const from = el.from === undefined ? -Infinity : constValue(el.from, at(i, 'from'), errors);
          const to = el.to === undefined ? Infinity : constValue(el.to, at(i, 'to'), errors);
          if (!(from < to)) {
            if (Number.isFinite(from) && Number.isFinite(to)) errors.push({ path: at(i), message: `interval "from" (${from}) must be less than "to" (${to})` });
            return;
          }
          const [cf, ct] = el.closed ?? [true, true];
          set = [{ from, to, closedFrom: cf && from !== -Infinity, closedTo: ct && to !== Infinity }];
        }
        const anim = resolveAnim(el.animate, 'draw', ['draw', 'fade'], at(i), errors, `an ${el.type}`);
        drawSet(i, set, role, anim);
        if (el.label) {
          const vis = set.filter((p) => p.to >= a && p.from <= b);
          const lo = vis.length ? Math.max(a, vis[0]!.from) : (a + b) / 2;
          const hi = vis.length ? Math.min(b, vis[vis.length - 1]!.to) : (a + b) / 2;
          const cx = px((lo + hi) / 2);
          queueLabel(ctx, `label-${i}`, el.label, role, (w, h) => aboveBelow(cx, lineY, w, h, 10), anim ? { anim: afterOf(anim) } : {});
        }
        return;
      }
      case 'point': {
        const x = constValue(el.at, at(i, 'at'), errors);
        if (!Number.isFinite(x)) return;
        if (x < a || x > b) {
          errors.push({ path: at(i, 'at'), message: `point ${formatValue(x).text} is outside the range [${a}, ${b}]` });
          return;
        }
        const anim = resolveAnim(el.animate, 'fade', ['fade'], at(i), errors, 'a point');
        const c: [number, number] = [px(x), lineY];
        prims.push({ kind: 'circle', key, role, clip: false, center: c, r: DOT_R, hollow: !!el.open, ...(anim ? { anim: fadeOf(anim) } : {}) });
        obstacles.points.push({ x: c[0], y: c[1], r: DOT_R });
        if (el.label) queueLabel(ctx, `label-${i}`, el.label, role, (w, h) => aboveBelow(c[0], lineY, w, h, 9), anim ? { anim: afterOf(anim) } : {});
        return;
      }
      case 'text':
      case 'mathLabel': {
        const x = constValue(el.at, at(i, 'at'), errors);
        if (!Number.isFinite(x)) return;
        if (x < a || x > b) {
          errors.push({ path: at(i, 'at'), message: `${el.type} position ${formatValue(x).text} is outside the range [${a}, ${b}]` });
          return;
        }
        const anim = resolveAnim(el.animate, 'fade', ['fade'], at(i), errors, `a ${el.type}`);
        const content = el.type === 'text' ? { text: el.text } : { tex: el.tex };
        queueLabel(ctx, key, content, role, (w, h) => aboveBelow(px(x), lineY, w, h, 12, el.side ?? 'above'), {
          ...(el.type === 'text' && role === 'note' ? { font: 'note' as const, size: theme.fontSize.note } : {}),
          ...(anim ? { anim: fadeOf(anim) } : {}),
        });
        return;
      }
    }
  });

  /** A solution set on the line: thick segments, arrows where it runs off the view, filled/open dots at ends. */
  function drawSet(i: number, set: SolutionSet, role: AnyRole, anim?: ResolvedAnim) {
    const pieceAnim = (): PrimAnim | undefined =>
      !anim ? undefined : anim.kind === 'draw' ? { kind: 'draw', delay: anim.delay, duration: anim.duration, span: [0, 1] } : fadeOf(anim);
    const endAnim = (): PrimAnim | undefined => (!anim ? undefined : anim.kind === 'draw' ? afterOf(anim) : fadeOf(anim));
    set.forEach((p, k) => {
      const key = `el-${i}-${k}`;
      if (p.to < a || p.from > b) return;
      if (p.from === p.to) {
        const c: [number, number] = [px(p.from), lineY];
        prims.push({ kind: 'circle', key: `${key}-pt`, role, clip: false, center: c, r: DOT_R, hollow: !p.closedFrom, ...withAnim(endAnim()) });
        obstacles.points.push({ x: c[0], y: c[1], r: DOT_R });
        return;
      }
      const offLeft = p.from < a;
      const offRight = p.to > b;
      const x0 = offLeft ? 6 : px(p.from);
      const x1 = offRight ? W - 6 : px(p.to);
      prims.push({ kind: 'line', key, role, clip: false, from: [x0, lineY], to: [x1, lineY], width: SOLUTION_WIDTH, ...withAnim(pieceAnim()) });
      obstacles.strokes.push({ key, points: [[x0, lineY], [x1, lineY]] });
      if (offLeft) prims.push({ kind: 'polygon', key: `${key}-l`, role, clip: false, points: arrowHead(1, lineY, -1, 0, 10), fillOpacity: 1, ...withAnim(endAnim()) });
      else prims.push({ kind: 'circle', key: `${key}-a`, role, clip: false, center: [x0, lineY], r: DOT_R, hollow: !p.closedFrom, ...withAnim(endAnim()) });
      if (offRight) prims.push({ kind: 'polygon', key: `${key}-r`, role, clip: false, points: arrowHead(W - 1, lineY, 1, 0, 10), fillOpacity: 1, ...withAnim(endAnim()) });
      else prims.push({ kind: 'circle', key: `${key}-b`, role, clip: false, center: [x1, lineY], r: DOT_R, hollow: !p.closedTo, ...withAnim(endAnim()) });
    });
  }

  if (errors.length) return { ok: false, errors };
  finishLabels(ctx);
  // dots above lines, labels above everything
  const rank = (p: (typeof prims)[number]) =>
    p.kind === 'text' || p.kind === 'mathLabel' ? 3 : p.kind === 'circle' || (p.kind === 'polygon' && p.role !== 'axis') ? 2 : 1;
  const sorted = prims.map((p, n) => ({ p, n })).sort((u, v) => rank(u.p) - rank(v.p) || u.n - v.n).map((u) => u.p);
  return {
    ok: true,
    scene: {
      width: W,
      height: H,
      plot: { x: 0, y: 0, width: W, height: H },
      viewport: { x: [a, b], y: [0, 1], width: W, height: H, padding: { top: 0, bottom: 0, left: PAD_X, right: PAD_X } },
      primitives: sorted,
      describe: fig.describe,
      samples: {},
      theme,
    },
  };
}

const withAnim = (anim: PrimAnim | undefined) => (anim ? { anim } : {});
