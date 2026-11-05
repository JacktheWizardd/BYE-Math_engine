import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boxStats, figureToScene, fiveNumber, frameAt, histogram, linearFit, timeline, type Primitive, type Scene } from '../src/core/index.ts';

const load = (path: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../examples/${path}`), 'utf8'));
const W = 338;
const sceneOf = (fig: unknown): Scene => {
  const r = figureToScene(fig, { width: W });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const errorsOf = (fig: unknown) => {
  const r = figureToScene(fig, { width: W });
  return r.ok ? '' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
};
const byKey = (s: Scene, key: string) => s.primitives.find((p) => p.key === key);

describe('statistics', () => {
  it('quartiles, both methods', () => {
    const odd = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(fiveNumber(odd, 'exclusive')).toEqual({ min: 1, q1: 2.5, median: 5, q3: 7.5, max: 9 });
    expect(fiveNumber(odd, 'inclusive')).toEqual({ min: 1, q1: 3, median: 5, q3: 7, max: 9 });
    const even = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(fiveNumber(even, 'exclusive')).toMatchObject({ q1: 2.5, median: 4.5, q3: 6.5 });
    expect(fiveNumber(even, 'inclusive')).toMatchObject({ q1: 2.5, median: 4.5, q3: 6.5 });
  });

  it('outliers and whiskers (1.5·IQR)', () => {
    const b = boxStats([55, 60, 64, 70, 72, 73, 75, 78, 80, 112]);
    expect(b).toMatchObject({ q1: 64, median: 72.5, q3: 78, low: 55, high: 80, outliers: [112] });
  });

  it('histogram counts, including the right edge', () => {
    const fig = load('figures/19-histogram.json');
    expect(histogram(fig.data, fig.bins).map((b) => b.count)).toEqual([2, 6, 10, 8, 4]);
    expect(histogram([0, 5, 10], { edges: [0, 5, 10] }).map((b) => b.count)).toEqual([1, 2]);
    expect(() => histogram([0, 11], { edges: [0, 5, 10] })).toThrow(/outside the bins/);
  });

  it('line of best fit', () => {
    expect(linearFit([[1, 2], [2, 4], [3, 6]])).toEqual({ slope: 2, intercept: 0, r: 1 });
    const f = linearFit([[1, 1], [2, 3], [3, 2]]);
    expect(f.slope).toBeCloseTo(0.5, 12);
    expect(f.intercept).toBeCloseTo(1, 12);
    expect(f.r).toBeCloseTo(0.5, 12);
  });
});

describe('number line', () => {
  it('open and closed dots at the exact positions', () => {
    const s = sceneOf(load('figures/13-numberline-chain.json'));
    const px = (x: number) => 18 + ((x + 4) / 9) * (W - 36);
    const a = byKey(s, 'el-0-0-a');
    const b = byKey(s, 'el-0-0-b');
    if (a?.kind !== 'circle' || b?.kind !== 'circle') throw new Error();
    expect(a.hollow).toBe(true);
    expect(b.hollow).toBe(false);
    expect(a.center[0]).toBeCloseTo(px(-1), 9);
    expect(b.center[0]).toBeCloseTo(px(3), 9);
  });

  it('unbounded pieces end in arrows', () => {
    const s = sceneOf(load('figures/14-numberline-union.json'));
    expect(byKey(s, 'el-0-0-l')?.kind).toBe('polygon');
    expect(byKey(s, 'el-0-1-r')?.kind).toBe('polygon');
    const zero = byKey(s, 'el-0-0-b');
    const two = byKey(s, 'el-0-1-a');
    expect(zero?.kind === 'circle' && zero.hollow).toBe(true);
    expect(two?.kind === 'circle' && two.hollow).toBe(false);
  });
});

describe('sign chart', () => {
  it('header values sit on their column lines', () => {
    const s = sceneOf(load('figures/16-signchart-rational.json'));
    for (let k = 0; k < 3; k++) {
      const col = byKey(s, `col-${k}`);
      const head = byKey(s, `head-${k}`);
      if (col?.kind !== 'line' || head?.kind !== 'mathLabel') throw new Error();
      expect(head.box.x + head.box.width / 2).toBeCloseTo(col.from[0], 6);
    }
  });

  it('f row signs and the undefined mark at x = 3', () => {
    const s = sceneOf(load('figures/16-signchart-rational.json'));
    const signs = [0, 1, 2, 3].map((j) => byKey(s, `r3-c${j}`)).map((p) => (p?.kind === 'text' ? p.text : '?'));
    expect(signs).toEqual(['−', '+', '−', '+']);
    expect(byKey(s, 'r3-u2-2')?.kind).toBe('line');
  });

  it('first-derivative test marks max and min', () => {
    const s = sceneOf(load('figures/17-signchart-derivative.json'));
    const t = (k: string) => {
      const p = byKey(s, k);
      return p?.kind === 'text' ? p.text : undefined;
    };
    expect(t('r1-z0')).toBe('max');
    expect(t('r1-z1')).toBe('min');
  });
});

describe('charts', () => {
  it('bar heights are proportional to values', () => {
    const fig = load('figures/18-bar.json');
    const s = sceneOf(fig);
    const ratios = fig.bars.map((b: { value: number }, i: number) => {
      const p = byKey(s, `bar-${i}`);
      if (p?.kind !== 'polygon') throw new Error();
      return (p.points[0]![1] - p.points[2]![1]) / b.value;
    });
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
  });

  it('dot plot stacks one dot per value', () => {
    const s = sceneOf(load('figures/21-dot.json'));
    expect(s.primitives.filter((p) => p.kind === 'circle').length).toBe(15);
  });

  it('scatter fit line and equation', () => {
    const s = sceneOf(load('figures/22-scatter.json'));
    expect(byKey(s, 'fit')?.kind).toBe('line');
    const label = byKey(s, 'fit-label');
    expect(label?.kind === 'mathLabel' && label.tex).toMatch(/^y = 5\.07x \+ 53,/);
  });
});

describe('every Stage 3 figure', () => {
  const files = readdirSync(join(import.meta.dirname, '../examples/figures')).filter((f) => f >= '13' && f < '23');
  it.each(files)('%s: builds, labels inside, last frame = static', (file) => {
    const s = sceneOf(load(`figures/${file}`));
    for (const p of s.primitives) {
      if (p.kind !== 'text' && p.kind !== 'mathLabel') continue;
      expect(p.box.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.box.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.box.x + p.box.width).toBeLessThanOrEqual(s.width + 1e-9);
      expect(p.box.y + p.box.height).toBeLessThanOrEqual(s.height + 1e-9);
    }
    const end = frameAt(s, timeline(s));
    end.forEach((p: Primitive, i) => expect(p).toBe(s.primitives[i]));
  });

  it('animated ones hide pieces at time 0', () => {
    for (const f of ['15-numberline-quadratic', '17-signchart-derivative', '18-bar', '22-scatter']) {
      const s = sceneOf(load(`figures/${f}.json`));
      expect(timeline(s)).toBeGreaterThan(0);
      expect(frameAt(s, 0).length).toBeLessThan(s.primitives.length);
    }
  });
});

describe('Stage 3 bad input', () => {
  it.each([
    ['unknown-kind.json', /Unknown figure kind "pie"/],
    ['bad-inequality.json', /elements\[0\]\.expr: Missing expression/],
    ['histogram-empty.json', /data: a histogram needs at least one value/],
    ['box-empty-group.json', /groups\[0\]\.data: a box plot group needs at least one value/],
    ['signchart-too-many-points.json', /31 critical points/],
  ])('%s', (file, msg) => {
    expect(errorsOf(load(`bad/${file}`))).toMatch(msg);
  });

  it('chart type and element kinds', () => {
    expect(errorsOf({ kind: 'chart', type: 'pie', describe: 'x' })).toMatch(/Unknown chart type "pie"/);
    expect(errorsOf({ kind: 'numberLine', range: [0, 1], elements: [{ type: 'segment' }], describe: 'x' })).toMatch(/Unknown element type "segment". Supported: inequality/);
    expect(errorsOf({ kind: 'signChart', describe: 'x' })).toMatch(/needs "f" or "rows"/);
  });
});
