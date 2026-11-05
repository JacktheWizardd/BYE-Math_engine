import { projector, type Camera, type V3 } from './camera.ts';
import { finishLabels, makeContext, queueLabel } from './kinds/common.ts';
import { formatNumber, type Measure, type Primitive } from './layout.ts';
import type { Scene3D } from './scene3d.ts';
import type { Rect } from './view.ts';

/**
 * 2D overlay for a 3D scene at a given camera: tick numbers on the box edges
 * nearest the viewer, axis names, and element labels — all at projected
 * positions and placed so they stay inside the figure. Recomputed on rotate.
 */
export function overlay3d(scene: Scene3D, camera: Camera, measure?: Partial<Measure>): Primitive[] {
  const W = scene.width;
  const H = scene.height;
  const ctx = makeContext({ width: W, height: H, theme: scene.theme, ...(measure ? { measure } : {}) }, 1, undefined, H);
  const pr = projector(camera, W, H);
  const P = (p: V3) => pr.project(p);
  const centre = P([0, 0, 0]);
  const { view, toBox } = scene;
  const tickSize = Math.max(scene.theme.fontSize.min, scene.theme.fontSize.tick);

  /** Boxes pushed away from the box centre on screen. */
  const outward = (x: number, y: number, gap: number) => (w: number, h: number): Rect[] => {
    const dx = x - centre.x;
    const dy = y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ext = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
    const cx = x + ux * (gap + ext), cy = y + uy * (gap + ext);
    return [{ x: cx - w / 2, y: cy - h / 2, width: w, height: h }];
  };

  if (scene.showBox) {
    const [x0, x1] = view.x, [y0, y1] = view.y, [z0, z1] = view.z;
    // x ticks on the bottom edge (y = y0 or y1) that is lower on screen; y ticks likewise; z on the leftmost vertical edge.
    const lower = (a: V3, b: V3) => (P(a).y >= P(b).y ? 0 : 1);
    const yEdge = [y0, y1][lower(toBox([(x0 + x1) / 2, y0, z0]), toBox([(x0 + x1) / 2, y1, z0]))]!;
    const xEdge = [x0, x1][lower(toBox([x0, (y0 + y1) / 2, z0]), toBox([x1, (y0 + y1) / 2, z0]))]!;
    const verticals: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const [zx, zy] = verticals.reduce((best, c) => (P(toBox([c[0], c[1], z0])).x < P(toBox([best[0], best[1], z0])).x ? c : best));
    const axes: { name: string; ticks: number[]; at: (v: number) => V3; mid: V3 }[] = [
      { name: 'x', ticks: scene.ticks.x, at: (v) => toBox([v, yEdge, z0]), mid: toBox([(x0 + x1) / 2, yEdge, z0]) },
      { name: 'y', ticks: scene.ticks.y, at: (v) => toBox([xEdge, v, z0]), mid: toBox([xEdge, (y0 + y1) / 2, z0]) },
      { name: 'z', ticks: scene.ticks.z, at: (v) => toBox([zx, zy, v]), mid: toBox([zx, zy, (z0 + z1) / 2]) },
    ];
    for (const ax of axes) {
      if (scene.tickLabels) {
        ax.ticks.forEach((v, k) => {
          const p = P(ax.at(v));
          queueLabel(ctx, `tick-${ax.name}-${k}`, { text: formatNumber(v) }, 'note', outward(p.x, p.y, 4), { font: 'math', size: tickSize });
        });
      }
      const m = P(ax.mid);
      queueLabel(ctx, `axis-${ax.name}`, { text: ax.name }, 'text', outward(m.x, m.y, scene.tickLabels ? 22 : 8), { font: 'mathItalic' });
    }
  }

  for (const l of scene.labels) {
    const p = P(l.at);
    queueLabel(
      ctx,
      l.key,
      l.tex !== undefined ? { tex: l.tex } : { text: l.text ?? '' },
      l.role,
      (w, h) => [
        { x: p.x + 8, y: p.y - h - 4, width: w, height: h },
        { x: p.x - w - 8, y: p.y - h - 4, width: w, height: h },
        { x: p.x + 10, y: p.y - h / 2, width: w, height: h },
        { x: p.x - w - 10, y: p.y - h / 2, width: w, height: h },
        { x: p.x - w / 2, y: p.y + 8, width: w, height: h },
      ],
      {},
    );
  }
  finishLabels(ctx);
  // carry label animations (fade) over from the 3D labels
  const anims = new Map(scene.labels.filter((l) => l.anim).map((l) => [l.key, l.anim!]));
  return ctx.prims.map((p) => {
    const a = anims.get(p.key);
    return a ? { ...p, anim: { kind: 'fade', delay: a.delay, duration: a.duration } } : p;
  });
}
