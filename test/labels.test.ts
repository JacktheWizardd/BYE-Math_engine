import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { figureToScene, placeLabels, strokeInside, type LabelRequest, type Obstacles, type Primitive, type Rect, type Scene } from '../src/core/index.ts';

const sceneOf = (fig: unknown, width = 323): Scene => {
  const r = figureToScene(fig, { width });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const labelBox = (s: Scene, key: string): Rect => {
  const p = s.primitives.find((q) => q.key === key) as Extract<Primitive, { box: Rect }> | undefined;
  if (!p) throw new Error(`no ${key}`);
  return p.box;
};
const dot = (s: Scene, key: string) => {
  const p = s.primitives.find((q) => q.key === key);
  if (p?.kind !== 'circle') throw new Error(`no dot ${key}`);
  return p.center;
};
const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const req = (key: string, boxes: Rect[], extra: Partial<LabelRequest> = {}): LabelRequest => ({
  key,
  width: boxes[0]!.width,
  height: boxes[0]!.height,
  explicit: false,
  candidates: boxes.map((b) => ({ box: b })),
  ...extra,
});
const none: Obstacles = { strokes: [], axes: [], points: [] };

// BYE Math §3.2 "How to spot it", with the label positions the app had before working around this.
const spot32 = {
  spec: 0,
  kind: 'plot2d',
  view: { x: [-1, 5], y: [-2.5, 10] },
  grid: { x: 1, y: 2 },
  axes: { x: true, y: true, labels: false },
  elements: [
    { id: 'f', type: 'function', y: 'x^2 - 2x', domain: [0, 4], role: 'f', label: { text: 'f(x) = x² − 2x', at: 3.3 } },
    { type: 'point', at: [0, 0], role: 'bound' },
    { type: 'point', at: [4, 8], role: 'bound' },
    { type: 'segment', from: [0, 0], to: [4, 8], role: 'bound' },
    { type: 'text', at: [1.2, 3.8], text: 'average slope 2', role: 'bound' },
    { type: 'tangent', to: 'f', at: 2, length: 3, role: 'F' },
    { type: 'point', at: [2, 0], role: 'F', label: { text: 'c = 2: the answer', at: 'below' } },
  ],
  describe: 'secant and tangent with equal slopes',
};

describe('label placement: the §3.2 figure', () => {
  const s = sceneOf(spot32);

  it('keeps "c = 2: the answer" below its point, growing the bottom padding (#1)', () => {
    const b = labelBox(s, 'label-6');
    const [, cy] = dot(s, 'el-6');
    expect(b.y).toBeGreaterThan(cy);
    expect(b.y + b.height).toBeLessThanOrEqual(s.height);
    expect(s.height - (s.plot.y + s.plot.height)).toBeGreaterThan(6); // more than the base padding
  });

  it('places every label clear of the curve, secant and tangent (#3)', () => {
    expect(s.labelCollisions).toBeUndefined();
    // Checked from the drawn primitives too, not only from what placement reports.
    const strokes = s.primitives.flatMap((p) => (p.kind === 'line' && p.role !== 'grid' && p.role !== 'axis' ? [[p.from, p.to]] : p.kind === 'polyline' ? [p.points] : []));
    for (const key of ['el-4', 'label-6']) for (const pts of strokes) expect(strokeInside(pts, labelBox(s, key))).toBe(-1);
  });
});

describe('placeLabels', () => {
  const canvas = box(0, 0, 200, 100);

  it('lets an explicit label keep its side and report the overflow, when the caller grows the padding (#1)', () => {
    const below = box(80, 92, 40, 14); // sticks out 8 px past the bottom margin
    const right = box(150, 40, 40, 14); // fits
    const r = req('l', [below, right], { explicit: true });
    const grown = placeLabels([r], canvas, none, { clamp: false, explicitOverflow: 58 });
    expect(grown.placed[0]!.box).toEqual(below);
    expect(grown.overflow.bottom).toBeCloseTo(8);
    // Kinds that never grow the padding still move the label inside.
    const fixed = placeLabels([r], canvas, none, { clamp: false });
    expect(fixed.placed[0]!.box).toEqual(right);
  });

  it('lets the asked-for side\'s diagonals keep their side too', () => {
    const below = box(80, 92, 40, 14);
    const belowRight = box(110, 92, 40, 14);
    const right = box(150, 40, 40, 14);
    const curve: Obstacles = { ...none, strokes: [{ key: 'f', points: [[100, 80], [100, 100]] }] }; // through "below"
    const r = req('l', [below, belowRight, right], { explicit: true, keep: 2 });
    expect(placeLabels([r], canvas, curve, { clamp: false, explicitOverflow: 58 }).placed[0]!.box).toEqual(belowRight);
  });

  it('scores a crossing by how much of the line is inside, not by how finely it was sampled (#2)', () => {
    // A: a densely sampled curve clips the corner of the first box. B: a straight 2-point segment runs
    // through the middle of the second. Counting sampled pieces used to make A look far worse.
    const a = box(20, 20, 60, 16);
    const b = box(120, 20, 60, 16);
    const corner: [number, number][] = Array.from({ length: 41 }, (_, i) => [74 + i * 0.25, 36 - i * 0.25] as [number, number]);
    const through: [number, number][] = [[150, 0], [150, 60]];
    const obstacles: Obstacles = { ...none, strokes: [{ key: 'curve', points: corner }, { key: 'line', points: through }] };
    const placed = placeLabels([req('l', [b, a])], canvas, obstacles, { clamp: false }).placed[0]!.box;
    expect(placed).toEqual(a);
  });

  it('measures the same line the same, however it was sampled (#2)', () => {
    const r = box(10, 10, 50, 20);
    const coarse: [number, number][] = [[0, 0], [70, 40]];
    const fine: [number, number][] = Array.from({ length: 141 }, (_, i) => [i * 0.5, (i * 0.5 * 40) / 70] as [number, number]);
    expect(strokeInside(fine, r)).toBeCloseTo(strokeInside(coarse, r), 6);
    expect(strokeInside([[0, 50], [5, 60]], r)).toBe(-1);
  });

  it('tries the farther fallback spots only when every nearby one clashes (#3)', () => {
    const near = box(50, 40, 40, 14);
    const far = box(50, 10, 40, 14);
    const line: Obstacles = { ...none, strokes: [{ key: 's', points: [[0, 47], [200, 47]] }] };
    const r = req('l', [near], { fallback: [{ box: far }] });
    expect(placeLabels([r], canvas, line).placed[0]!.box).toEqual(far);
    // With nothing to dodge, the nearby spot wins even though the fallback is also clear.
    expect(placeLabels([r], canvas, none).placed[0]!.box).toEqual(near);
  });

  it('reports what a label still runs into, except strokes it annotates and quiet labels (#3)', () => {
    const l = box(50, 40, 40, 14);
    const obstacles: Obstacles = {
      strokes: [{ key: 'own', points: [[0, 47], [200, 47]] }, { key: 'other', points: [[70, 0], [70, 100]] }],
      axes: [],
      points: [{ x: 55, y: 45, r: 3 }],
    };
    const { collisions } = placeLabels([req('a', [l], { own: ['own'] }), req('t', [box(60, 42, 20, 10)], { quiet: true })], canvas, obstacles);
    expect(collisions).toEqual([{ key: 'a', strokes: ['other'], labels: ['t'], points: 1 }]);
  });
});

describe('label collisions in scenes', () => {
  it('reports a note that has no clear spot anywhere near it (#3)', () => {
    // Vertical lines every quarter unit (~10 px): no spot for a 50 px note crosses none of them.
    const bars = Array.from({ length: 33 }, (_, i) => ({ type: 'segment', from: [-3 + i * 0.25, -5], to: [-3 + i * 0.25, 10] }));
    const s = sceneOf({ kind: 'plot2d', view: { x: [-3, 5], y: [-5, 10] }, elements: [...bars, { type: 'text', at: [1, 2], text: 'crowded' }], describe: 'test' }, 338);
    const c = s.labelCollisions?.find((x) => x.key === 'el-33');
    expect(c?.strokes.length).toBeGreaterThan(0);
  });

  it("doesn't report contour level numbers sitting on their own level", () => {
    const fig = JSON.parse(readFileSync(join(import.meta.dirname, '../examples/figures/29-gradient-contours.json'), 'utf8'));
    for (const width of [323, 600]) {
      const s = sceneOf(fig, width);
      expect((s.labelCollisions ?? []).filter((c) => c.key.startsWith('label-0-'))).toEqual([]);
    }
  });
});

describe('axis numbers', () => {
  const base = { spec: 0, kind: 'plot2d', view: { x: [-1, 5], y: [-2, 10] }, elements: [{ type: 'function', y: 'x^2 - 2x' }], describe: 'a parabola' };
  const tickKeys = (s: Scene) => s.primitives.filter((p) => p.key.startsWith('tick-')).map((p) => p.key);

  it('are on by default, with or without an axes entry', () => {
    expect(tickKeys(sceneOf(base)).length).toBeGreaterThan(0);
    expect(tickKeys(sceneOf({ ...base, axes: { x: true, y: true } })).length).toBeGreaterThan(0);
  });

  it('can still be turned off', () => {
    expect(tickKeys(sceneOf({ ...base, axes: { x: true, y: true, labels: false } }))).toEqual([]);
  });
});

// BYE Math §4.4 "Why it works", last frame: before numbers gave way, 2, 5 and 6 sat under the region labels.
const calc44why = {"spec":0,"kind":"plot2d","view":{"x":[-0.3,6.4],"y":[-14,13.5]},"grid":{"x":1,"y":2},"axes":{"x":true,"y":true,"labels":true},"elements":[{"id":"v","type":"function","y":"4*x - x^2","role":"f","label":{"text":"v","at":0.6}},{"id":"F","type":"function","y":"2*x^2 - x^3/3","domain":[0,6.2],"role":"F","label":{"text":"F","at":3.2}},{"type":"segment","from":[1.4,"F(2) - 2.4"],"to":[2.6,"F(2) + 2.4"],"role":"bound"},{"type":"point","at":[2,"v(2)"],"role":"bound"},{"type":"region","under":"v","from":0,"to":4,"role":"area","label":{"text":"+32/3","at":"center"}},{"type":"segment","from":[4,0],"to":[4,"F(4)"],"role":"bound","label":{"text":"F rises 32/3","at":"right"}},{"type":"region","under":"v","from":4,"to":6,"role":"bound","label":{"text":"−32/3","at":"center"}},{"type":"point","at":[6,"F(6)"],"role":"bound","label":{"text":"F(6) = 0","at":"above"}},{"id":"flip","type":"function","y":"abs(4*x - x^2)","domain":[4,6],"role":"F","animate":true},{"type":"region","under":"flip","from":4,"to":6,"role":"area","animate":true},{"type":"text","at":[3.7,8.2],"text":"distance = 64/3","role":"note","animate":true}],"describe":"The speed v(t) = 4t − t² in blue and its antiderivative F(t) = 2t² − t³/3 in green. A tangent to F has the slope v. The area above the axis is 32/3, the rise of F; the area below is −32/3, which brings F back to 0. Flipping that part up gives the distance, 64/3."};

describe('axis numbers give way', () => {
  const crowded = (labelText: string, at: [number, number]) => ({
    spec: 0, kind: 'plot2d', view: { x: [-1, 5], y: [-2, 10] },
    elements: [
      { type: 'function', y: 'x^2 - 2x', domain: [0, 4] },
      { type: 'text', at, text: labelText },
      { type: 'point', at: [3, 0] },
    ],
    describe: 'a parabola with a note on the axis',
  });
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
  it.each([160, 240, 323])('no number covers a label at width %i', (width) => {
    for (const f of [calc44why, crowded('a long note here', [2, -0.5]), { ...spot32, axes: { x: true, y: true, labels: true } }]) {
      const s = sceneOf(f, width);
      const boxed = s.primitives.filter((p): p is Extract<Primitive, { box: Rect }> => 'box' in p);
      const ticks = boxed.filter((p) => p.key.startsWith('tick-'));
      expect(ticks.length).toBeGreaterThan(0);
      for (const t of ticks) for (const o of boxed) if (!o.key.startsWith('tick-')) expect(hit(t.box, o.box)).toBe(false);
    }
  });
});
