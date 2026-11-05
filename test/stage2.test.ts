import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { figureToScene, frameAt, timeline, toPx, validatePlot2d, type Primitive, type Scene } from '../src/core/index.ts';

const load = (path: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../examples/${path}`), 'utf8'));
const W = 338;
const sceneOf = (fig: unknown): Scene => {
  const r = figureToScene(fig, { width: W });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const modelOf = (fig: unknown) => {
  const r = validatePlot2d(fig);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.model;
};
const errorsOf = (fig: unknown) => {
  const r = figureToScene(fig, { width: W });
  return r.ok ? '' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
};
const fig = (elements: unknown[], view = { x: [-3, 5], y: [-5, 10] }) => ({ kind: 'plot2d', view, elements, describe: 'test figure' });

describe('tangent', () => {
  it('tangent to x² at 2 has slope 4 and touches at (2, 4)', () => {
    const m = modelOf(load('figures/08-tangent.json'));
    const t = m.items.find((i) => i.el.type === 'tangent');
    if (t?.type !== 'line') throw new Error('no tangent line');
    expect(t.p).toEqual([2, 4]);
    expect((t.q[1] - t.p[1]) / (t.q[0] - t.p[0])).toBe(4);
  });

  it('is pixel-exact through the touch point', () => {
    const s = sceneOf(load('figures/08-tangent.json'));
    const line = s.primitives.find((p) => p.key === 'el-1');
    if (line?.kind !== 'line') throw new Error();
    const [px, py] = toPx(s.viewport, [2, 4]);
    const t = (px - line.from[0]) / (line.to[0] - line.from[0]);
    expect(Math.abs(line.from[1] + t * (line.to[1] - line.from[1]) - py)).toBeLessThan(0.5);
  });

  it('length gives a segment centred on the touch point', () => {
    const m = modelOf(fig([{ id: 'f', type: 'function', y: 'x^2' }, { type: 'tangent', to: 'f', at: 1, length: 2 }]));
    const t = m.items.find((i) => i.el.type === 'tangent');
    if (t?.type !== 'segment') throw new Error();
    expect((t.from[0] + t.to[0]) / 2).toBeCloseTo(1, 12);
    expect((t.from[1] + t.to[1]) / 2).toBeCloseTo(1, 12);
    expect(Math.hypot(t.to[0] - t.from[0], t.to[1] - t.from[1])).toBeCloseTo(2, 12);
  });

  it('uses the numeric fallback where there is no symbolic derivative', () => {
    const m = modelOf(fig([{ id: 'f', type: 'function', y: 'max(x, x^2)' }, { type: 'tangent', to: 'f', at: 2 }]));
    const t = m.items.find((i) => i.el.type === 'tangent');
    if (t?.type !== 'line') throw new Error();
    expect((t.q[1] - t.p[1]) / (t.q[0] - t.p[0])).toBeCloseTo(4, 6);
  });
});

describe('intersection', () => {
  it('2x and x² meet at (0, 0) and (2, 4)', () => {
    const m = modelOf(load('figures/09-intersection.json'));
    const [a, b] = [m.points.get('A')!, m.points.get('B')!];
    expect(Math.abs(a[0]) + Math.abs(a[1])).toBeLessThan(1e-9);
    expect(Math.abs(b[0] - 2)).toBeLessThan(1e-9);
    expect(Math.abs(b[1] - 4)).toBeLessThan(1e-9);
  });

  it('roots of (x+1)(x−3) by index and near', () => {
    const els = (pick: object) => [{ id: 'f', type: 'function', y: '(x+1)(x-3)' }, { id: 'R', type: 'intersection', of: ['f'], ...pick }];
    expect(modelOf(fig(els({ index: 0 }))).points.get('R')![0]).toBeCloseTo(-1, 9);
    expect(modelOf(fig(els({ index: 1 }))).points.get('R')![0]).toBeCloseTo(3, 9);
    expect(modelOf(fig(els({ near: 2.5 }))).points.get('R')![0]).toBeCloseTo(3, 9);
    expect(errorsOf(fig(els({ index: 2 })))).toMatch(/meet 2 times/);
  });

  it('finds a touching root (x² with the x-axis)', () => {
    const m = modelOf(fig([{ id: 'f', type: 'function', y: '(x-1)^2' }, { id: 'R', type: 'intersection', of: ['f'] }]));
    expect(m.points.get('R')![0]).toBeCloseTo(1, 6);
  });

  it('a curve and a line, and a vertical line', () => {
    const m = modelOf(
      fig([
        { id: 'f', type: 'function', y: 'x^2' },
        { id: 'L', type: 'line', point: [0, 1], slope: 0 },
        { id: 'V', type: 'line', through: [[1.5, 0], [1.5, 1]] },
        { id: 'A', type: 'intersection', of: ['f', 'L'], near: 1 },
        { id: 'B', type: 'intersection', of: ['V', 'f'] },
      ]),
    );
    expect(m.points.get('A')![0]).toBeCloseTo(1, 9);
    expect(m.points.get('B')).toEqual([1.5, 2.25]);
  });
});

describe('point references', () => {
  it('"from": "B" and B.x resolve', () => {
    const m = modelOf(load('figures/09-intersection.json'));
    const seg = m.items.find((i) => i.type === 'segment');
    if (seg?.type !== 'segment') throw new Error();
    expect(seg.from[0]).toBeCloseTo(2, 9);
    expect(seg.from[1]).toBe(0);
    expect(seg.to).toEqual(m.points.get('B'));
  });

  it('forward references work (dependency order, not array order)', () => {
    const m = modelOf(fig([{ type: 'segment', from: [0, 0], to: 'P' }, { id: 'P', type: 'point', on: 'f', x: 2 }, { id: 'f', type: 'function', y: 'x + 1' }]));
    const seg = m.items[0]!;
    expect(seg.type === 'segment' && seg.to).toEqual([2, 3]);
  });

  it("f'(x) as a function body, and tangents at a point's x", () => {
    const m = modelOf(load('figures/10-derivative.json'));
    expect(m.functions.get('fp')!.fn(2)).toBe(9);
    expect(m.points.get('c')![0]).toBeCloseTo(1, 9);
  });
});

describe('Stage 2 bad input', () => {
  it.each([
    ['tangent-no-derivative.json', /has no tangent at x = 0/],
    ['intersection-none.json', /don't meet inside the view/],
    ['unknown-point-ref.json', /No element with id "Q"/],
    ['point-cycle.json', /Circular definition: P → Q → P/],
  ])('%s', (file, msg) => {
    expect(errorsOf(load(`bad/${file}`))).toMatch(msg);
  });

  it('wrong kinds of reference', () => {
    expect(errorsOf(fig([{ id: 's', type: 'segment', from: [0, 0], to: [1, 1] }, { type: 'point', at: ['s.x', 0] }]))).toMatch(/"s" is a segment, not a point/);
    expect(errorsOf(fig([{ id: 's', type: 'segment', from: [0, 0], to: [1, 1] }, { type: 'tangent', to: 's', at: 0 }]))).toMatch(/"s" is a segment, not a function/);
    expect(errorsOf(fig([{ id: 'f', type: 'function', y: 'x' }, { type: 'segment', from: 'f', to: [1, 1] }]))).toMatch(/"f" is a function, not a point/);
  });

  it('animation kinds must fit the element', () => {
    expect(errorsOf(fig([{ id: 'f', type: 'function', y: 'x', animate: { kind: 'fill' } }]))).toMatch(/"fill" doesn't apply to a function/);
    expect(errorsOf(fig([{ type: 'point', at: [1, 1], animate: { kind: 'move' } }]))).toMatch(/only a point with "on" can move/);
  });
});

describe('animation timeline', () => {
  const s = sceneOf(load('figures/11-area-animated.json'));
  const total = timeline(s);

  it('total time is the last piece to finish', () => {
    expect(total).toBe(2200);
  });

  it('frame 0 hides every animated piece', () => {
    const f0 = frameAt(s, 0);
    const animatedKeys = new Set(s.primitives.filter((p) => p.anim).map((p) => p.key));
    expect(f0.some((p) => animatedKeys.has(p.key))).toBe(false);
    expect(f0.length).toBe(s.primitives.length - animatedKeys.size);
  });

  it('the last frame is identical to the static scene', () => {
    expect(frameAt(s, total)).toEqual(s.primitives);
    const end = frameAt(s, total);
    end.forEach((p, i) => expect(p).toBe(s.primitives[i]));
  });

  it('half-way through the fill, the top edge is a prefix of the curve samples', () => {
    const region = s.primitives.find((p) => p.kind === 'polygon')!;
    if (region.anim?.kind !== 'fill') throw new Error();
    const mid = region.anim.delay + region.anim.duration / 2;
    const frame = frameAt(s, mid).find((p) => p.key === region.key) as Extract<Primitive, { kind: 'polygon' }>;
    const curve = region.anim.top;
    // frame = top samples…, top cut point, bottom cut point, bottom start (x drops back to `from`)
    const back = frame.points.findIndex((p, i) => i > 0 && p[0] < frame.points[i - 1]![0]);
    const top = frame.points.slice(0, back - 2);
    expect(frame.points[back - 2]![0]).toBeCloseTo(frame.points[back - 1]![0], 9); // both cut points share x
    expect(top).toEqual(curve.slice(0, top.length));
    expect(top.length).toBeGreaterThan(1);
    expect(top.length).toBeLessThan(curve.length);
  });

  it('a curve draws as a growing prefix of itself', () => {
    const curve = s.primitives.find((p) => p.kind === 'polyline')!;
    if (curve.kind !== 'polyline' || curve.anim?.kind !== 'draw') throw new Error();
    const f = frameAt(s, curve.anim.duration / 2).find((p) => p.key === curve.key);
    if (f?.kind !== 'polyline') throw new Error();
    expect(f.points.length).toBeLessThanOrEqual(curve.points.length);
    expect(f.points.slice(0, -1)).toEqual(curve.points.slice(0, f.points.length - 1));
  });

  it('a moving point stays on its curve and its label follows', () => {
    const sc = sceneOf(load('figures/12-point-moves.json'));
    const dot = sc.primitives.find((p) => p.kind === 'circle')!;
    const label = sc.primitives.find((p) => p.key === 'label-1')!;
    if (dot.kind !== 'circle' || dot.anim?.kind !== 'move' || label.kind !== 'text') throw new Error();
    for (const ms of [0, 200, 800, 1400]) {
      const frame = frameAt(sc, ms);
      const d = frame.find((p) => p.key === dot.key);
      const l = frame.find((p) => p.key === label.key);
      if (d?.kind !== 'circle' || l?.kind !== 'text') throw new Error();
      // back to math coords: y must equal f(x)
      const r = sc.viewport;
      const plotW = r.width - r.padding.left - r.padding.right;
      const plotH = r.height - r.padding.top - r.padding.bottom;
      const mx = r.x[0] + ((d.center[0] - r.padding.left) / plotW) * (r.x[1] - r.x[0]);
      const my = r.y[0] + ((r.padding.top + plotH - d.center[1]) / plotH) * (r.y[1] - r.y[0]);
      // points between samples are on the sampled polyline: within 0.25px of f
      const pxPerUnit = plotH / (r.y[1] - r.y[0]);
      expect(Math.abs(my - (Math.sin(mx) + mx / 2)) * pxPerUnit).toBeLessThan(0.25);
      // label keeps its offset from the dot
      expect(l.x - d.center[0]).toBeCloseTo(label.x - dot.center[0], 9);
      expect(l.y - d.center[1]).toBeCloseTo(label.y - dot.center[1], 9);
    }
    expect(frameAt(sc, timeline(sc))).toEqual(sc.primitives);
  });

  it('figures without animate have an empty timeline', () => {
    expect(timeline(sceneOf(load('figures/01-reference-area.json')))).toBe(0);
  });
});
