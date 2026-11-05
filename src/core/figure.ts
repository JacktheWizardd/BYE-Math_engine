import { validateSpec } from '../spec/index.ts';
import type { SceneOptions, SceneResult } from './layout.ts';
import { compileFigure } from './model.ts';
import { buildScene } from './scene.ts';
import { numberLineScene } from './kinds/numberLine.ts';
import { signChartScene } from './kinds/signChart.ts';
import { chartScene } from './kinds/chart.ts';

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
    }
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Internal error: ${String((e as Error)?.message ?? e)}` }] };
  }
}
