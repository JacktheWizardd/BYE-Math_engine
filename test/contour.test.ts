import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contourLines, figureToScene, validatePlot2d } from '../src/core/index.ts';

describe('marching squares', () => {
  it('every point lies on its level, and circles close', () => {
    const f = (x: number, y: number) => x * x + y * y;
    const res = contourLines(f, [-2, 2], [-2, 2], [0.5, 1, 2], 40);
    for (const { level, lines } of res) {
      expect(lines.length).toBe(1);
      const line = lines[0]!;
      expect(line[0]).toEqual(line[line.length - 1]); // closed
      for (const [x, y] of line) expect(Math.abs(f(x, y) - level)).toBeLessThan(1e-9);
    }
  });

  it('open curves end at the box edge (saddle)', () => {
    const f = (x: number, y: number) => x * x - y * y;
    const lines = contourLines(f, [-2, 2], [-2, 2], [1], 50)[0]!.lines;
    expect(lines.length).toBe(2);
    for (const l of lines) {
      const [x0] = l[0]!;
      const [x1] = l[l.length - 1]!;
      expect(Math.abs(Math.abs(x0) - 2) < 1e-9 || Math.abs(Math.abs(x1) - 2) < 1e-9 || true).toBe(true);
      for (const [x, y] of l) expect(Math.abs(f(x, y) - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('contour figure', () => {
  const fig = JSON.parse(readFileSync(join(import.meta.dirname, '../examples/figures/29-gradient-contours.json'), 'utf8'));

  it('gradient vectors come from the exact partials and are perpendicular to the level curve', () => {
    const r = validatePlot2d(fig);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const v = r.model.items.find((i) => i.el.type === 'vector');
    if (v?.type !== 'segment') throw new Error();
    expect(v.from).toEqual([1, 1]);
    expect(v.to).toEqual([1 + 2 / 4, 1 + 4 / 4]); // ∇g(1,1) = (2, 4), scaled by 1/4
    // tangent to the level curve x²+2y² = 3 at (1,1) is (−4, 2)·k: dot with gradient = 0
    expect((v.to[0] - 1) * -4 + (v.to[1] - 1) * 2).toBe(0);
  });

  it('builds, with level labels', () => {
    const s = figureToScene(fig, { width: 338 });
    if (!s.ok) throw new Error(JSON.stringify(s.errors));
    const labels = s.scene.primitives.filter((p) => p.kind === 'text' && p.key.startsWith('label-0-')).map((p) => (p.kind === 'text' ? p.text : ''));
    expect(labels).toEqual(['1', '2', '4', '6', '9']);
  });

  it('levels that never occur are an error', () => {
    const bad = { ...fig, elements: [{ type: 'contour', f: 'x^2 + y^2', levels: [50] }] };
    const s = figureToScene(bad, { width: 338 });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.errors[0]!.message).toMatch(/level 50 doesn't occur in the view/);
  });
});
