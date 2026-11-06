import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileExpr } from '../src/expr';
import { figureToScene, integrate, toPx, validatePlot2d, type Polyline, type Scene } from '../src/core';

const load = (path: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../examples/${path}`), 'utf8'));
const reference = load('figures/01-reference-area.json');
const WIDTH = 338;

const sceneOf = (fig: unknown, width = WIDTH): Scene => {
  const r = figureToScene(fig, { width });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};

/** Pixel y of a pixel polyline at pixel x (linear interpolation). */
const yAt = (pts: [number, number][], x: number): number => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    if ((ax <= x && x <= bx) || (bx <= x && x <= ax)) return ay + ((x - ax) / (bx - ax || 1)) * (by - ay);
  }
  return NaN;
};

describe('§9 exactness: reference figure', () => {
  const scene = sceneOf(reference);
  const curve = scene.primitives.find((p) => p.kind === 'polyline' && p.key.startsWith('el-0'));
  if (curve?.kind !== 'polyline') throw new Error('no curve');

  it('the line passes through pixel(1, 3) and pixel(3, 7) within 0.5px', () => {
    for (const p of [[1, 3], [3, 7]] as const) {
      const [px, py] = toPx(scene.viewport, p);
      expect(Math.abs(yAt(curve.points, px) - py)).toBeLessThan(0.5);
      // and the curve has a sample exactly there
      expect(curve.points.some(([x, y]) => Math.hypot(x - px, y - py) < 1e-9)).toBe(true);
    }
  });

  it("the region polygon's top edge equals the curve's samples between 1 and 3", () => {
    const region = scene.primitives.find((p) => p.kind === 'polygon');
    if (region?.kind !== 'polygon') throw new Error('no region');
    const curveBetween = curve.points.filter(([x]) => {
      const [x1] = toPx(scene.viewport, [1, 0]);
      const [x3] = toPx(scene.viewport, [3, 0]);
      return x >= x1 - 1e-9 && x <= x3 + 1e-9;
    });
    // polygon = (1,0), top edge…, (3,0)
    const top = region.points.slice(1, -1);
    expect(top).toEqual(curveBetween);
    expect(top.length).toBeGreaterThan(2);
    const mathTop = scene.samples.f!.flat().filter(([x]) => x >= 1 && x <= 3);
    expect(mathTop[0]).toEqual([1, 3]);
    expect(mathTop[mathTop.length - 1]).toEqual([3, 7]);
  });

  it('numeric area of the region = 10 ± 1e-6', () => {
    const f = compileExpr('2*x + 1', { variables: ['x'], functions: [] });
    expect(Math.abs(integrate(f, 1, 3) - 10)).toBeLessThan(1e-6);
  });

  it('point on: f, x: 3 resolves to (3, 7)', () => {
    const r = validatePlot2d({ ...reference, elements: [...reference.elements, { type: 'point', on: 'f', x: 3 }] });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const point = r.model.items.find((i) => i.type === 'point');
    expect(point?.type === 'point' && point.at).toEqual([3, 7]);
  });

  it('point open: true draws a hollow dot (a hole in the graph); points are solid by default', () => {
    const s = sceneOf({ ...reference, elements: [...reference.elements, { type: 'point', on: 'f', x: 3, open: true }, { type: 'point', on: 'f', x: 1 }] });
    const dots = s.primitives.filter((p) => p.kind === 'circle');
    expect(dots.map((d) => d.kind === 'circle' && !!d.hollow)).toEqual([true, false]);
  });

  it('segment coordinate "f(1)" resolves to 3', () => {
    const r = validatePlot2d(reference);
    if (!r.ok) throw new Error();
    const seg = r.model.items.find((i) => i.type === 'segment');
    expect(seg?.type === 'segment' && seg.to).toEqual([1, 3]);
  });

  it('exposes describe', () => {
    expect(scene.describe).toBe(reference.describe);
  });

  it('keeps every label inside the figure, min 11pt', () => {
    for (const p of scene.primitives) {
      if (p.kind !== 'text' && p.kind !== 'mathLabel') continue;
      expect(p.fontSize).toBeGreaterThanOrEqual(11);
      expect(p.box.x).toBeGreaterThanOrEqual(0);
      expect(p.box.y).toBeGreaterThanOrEqual(0);
      expect(p.box.x + p.box.width).toBeLessThanOrEqual(scene.width);
      expect(p.box.y + p.box.height).toBeLessThanOrEqual(scene.height);
    }
  });

  it('puts the a/b labels below the axis (padding grows instead of moving them)', () => {
    const axis = scene.primitives.find((p) => p.key === 'axis-x');
    if (axis?.kind !== 'line') throw new Error();
    for (const key of ['label-2', 'label-3']) {
      const l = scene.primitives.find((p) => p.key === key);
      if (l?.kind !== 'text') throw new Error(key);
      expect(l.box.y).toBeGreaterThan(axis.from[1]);
    }
  });
});

describe('§9 gaps: no line across an asymptote', () => {
  const crossesAsymptote = (runs: Polyline[], poles: number[]) =>
    runs.some((r) => r.some((p, i) => i > 0 && poles.some((a) => r[i - 1]![0] < a && p[0] > a)));

  it('1/x on [-3, 3]', () => {
    const scene = sceneOf(load('figures/04-reciprocal.json'));
    const runs = scene.samples.f!;
    expect(runs.length).toBe(2);
    expect(crossesAsymptote(runs, [0])).toBe(false);
    // the two halves get close to the asymptote (off-screen)
    expect(runs[0]!.at(-1)![1]).toBeLessThan(-4);
    expect(runs[1]![0]![1]).toBeGreaterThan(4);
  });

  it('tan(x)', () => {
    const scene = sceneOf(load('figures/07-tan.json'));
    const runs = scene.samples.f!;
    const poles = [-3, -1, 1, 3].map((k) => (k * Math.PI) / 2);
    expect(runs.length).toBe(5); // 4 asymptotes in view → 5 pieces
    expect(crossesAsymptote(runs, poles)).toBe(false);
  });

  it('floor(x) breaks at each jump', () => {
    const scene = sceneOf({ kind: 'plot2d', view: { x: [0, 3.5], y: [-1, 4] }, elements: [{ id: 'f', type: 'function', y: 'floor(x)' }], describe: 'steps' });
    expect(scene.samples.f!.length).toBe(4);
  });

  it('sqrt(x) starts exactly at its domain edge', () => {
    const scene = sceneOf({ kind: 'plot2d', view: { x: [-2, 4], y: [-1, 3] }, elements: [{ id: 'f', type: 'function', y: 'sqrt(x)' }], describe: 'sqrt' });
    const first = scene.samples.f![0]![0]!;
    expect(first[0]).toBeGreaterThanOrEqual(0);
    expect(first[0]).toBeLessThan(1e-9);
  });

  it('a smooth curve stays one run and is dense where it bends', () => {
    const scene = sceneOf({ kind: 'plot2d', view: { x: [-3, 3], y: [-1, 9] }, elements: [{ id: 'f', type: 'function', y: 'x^2' }], describe: 'p' });
    expect(scene.samples.f!.length).toBe(1);
    const line = sceneOf({ kind: 'plot2d', view: { x: [-3, 3], y: [-1, 9] }, elements: [{ id: 'f', type: 'function', y: 'x' }], describe: 'p' });
    const wavy = sceneOf({ kind: 'plot2d', view: { x: [-3, 3], y: [-1, 9] }, elements: [{ id: 'f', type: 'function', y: '4 + 4sin(6x)' }], describe: 'p' });
    expect(wavy.samples.f![0]!.length).toBeGreaterThan(1.5 * line.samples.f![0]!.length);
  });
});

describe('§9 bad input: clear errors, never a crash', () => {
  const bad = readdirSync(join(import.meta.dirname, '../examples/bad')).filter((f) => f.endsWith('.json'));
  it.each(bad)('%s', (file) => {
    const r = figureToScene(load(`bad/${file}`), { width: WIDTH });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
    for (const e of r.errors) expect(e.message.length).toBeGreaterThan(5);
  });

  it('messages say what went wrong', () => {
    const msg = (f: string) => {
      const r = figureToScene(load(`bad/${f}`), { width: WIDTH });
      return r.ok ? '' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
    };
    expect(msg('unknown-type.json')).toMatch(/elements\[0\]\.type: Unknown element type "circle"/);
    expect(msg('invalid-expression.json')).toMatch(/elements\[0\]\.y: Unexpected "\*"/);
    expect(msg('region-outside-view.json')).toMatch(/outside the view/);
    expect(msg('missing-describe.json')).toMatch(/describe/);
    expect(msg('unknown-reference.json')).toMatch(/No element with id "g"/);
    expect(msg('region-across-gap.json')).toMatch(/gap/);
    expect(msg('circular.json')).toMatch(/Circular/);
  });

  it.each([null, 42, 'plot', [], { kind: 'plot2d' }])('garbage %j', (input) => {
    expect(figureToScene(input, { width: WIDTH }).ok).toBe(false);
  });
});

describe('gallery figures', () => {
  // 2D kinds only; plot3d figures are covered in plot3d.test.ts
  const files = readdirSync(join(import.meta.dirname, '../examples/figures')).filter((f) => f.endsWith('.json') && load(`figures/${f}`).kind !== 'plot3d');
  it.each(files)('%s builds', (file) => {
    const fig = load(`figures/${file}`);
    const s = sceneOf(fig);
    expect(s.describe.length).toBeGreaterThan(10);
    for (const p of s.primitives) {
      if (p.kind === 'text' || p.kind === 'mathLabel') {
        expect(p.box.x).toBeGreaterThanOrEqual(0);
        expect(p.box.y + p.box.height).toBeLessThanOrEqual(s.height + 1e-9);
      }
    }
  });
  it('builds at other widths too', () => {
    for (const w of [240, 338, 600]) sceneOf(reference, w);
  });
});

describe('core purity', () => {
  it('core, spec and expr import no React or renderer', () => {
    for (const dir of ['core', 'spec', 'expr']) {
      for (const f of readdirSync(join(import.meta.dirname, `../src/${dir}`))) {
        if (!/\.(ts|js)$/.test(f)) continue;
        const src = readFileSync(join(import.meta.dirname, `../src/${dir}/${f}`), 'utf8');
        expect(src, `${dir}/${f}`).not.toMatch(/from ['"](react|react-native|react-native-svg)['"/]/);
      }
    }
  });
});
