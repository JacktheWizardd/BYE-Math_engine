import { validateSpec } from '../spec/index.ts';
import type { SceneOptions, SceneResult } from './layout.ts';
import { compileFigure } from './model.ts';
import { buildScene } from './scene.ts';
import { numberLineScene } from './kinds/numberLine.ts';
import { signChartScene } from './kinds/signChart.ts';
import { chartScene } from './kinds/chart.ts';
import { plot3dScene } from './kinds/plot3d.ts';
import type { Scene3DResult } from './scene3d.ts';

/** JSON in → scene out: validate, compile, lay out (any figure kind). Never throws. */
export function figureToScene(input: unknown, opts: SceneOptions): SceneResult {
  try {
    const v = validateSpec(input);
    if (!v.ok) return v;
    const fig = v.figure;
    switch (fig.kind) {
      case 'plot2d': {
        const c = compileFigure(fig);
        if (!c.ok) return c;
        return buildScene(c.model, opts);
      }
      case 'numberLine':
        return numberLineScene(fig, opts);
      case 'signChart':
        return signChartScene(fig, opts);
      case 'chart':
        return chartScene(fig, opts);
      case 'plot3d':
        // 3D figures are laid out by plot3dScene (core) and drawn by the GL renderer in bye-math-engine/native3d.
        return { ok: false, errors: [{ path: 'kind', message: '3D figures need the 3D renderer: use ByeFigure3D from "bye-math-engine/native3d" (or import that entry once so ByeFigure can draw them)' }] };
    }
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Internal error: ${String((e as Error)?.message ?? e)}` }] };
  }
}

/** JSON in → 3D scene out (plot3d figures). Never throws. */
export function figureToScene3d(input: unknown, opts: SceneOptions): Scene3DResult {
  try {
    const v = validateSpec(input);
    if (!v.ok) return v;
    if (v.figure.kind !== 'plot3d') return { ok: false, errors: [{ path: 'kind', message: `expected a plot3d figure, got ${v.figure.kind}` }] };
    return plot3dScene(v.figure, opts);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Internal error: ${String((e as Error)?.message ?? e)}` }] };
  }
}
