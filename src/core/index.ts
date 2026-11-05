// Pure TypeScript math core. No React or rendering imports here.
export * from './view.ts';
export * from './sample.ts';
export * from './solve.ts';
export * from './theme.ts';
export * from './labels.ts';
export * from './model.ts';
export * from './scene.ts';

import { validateSpec, type Figure, type FigureIssue } from '../spec/index.ts';
import { compileFigure, type FigureModel } from './model.ts';

/** Full validation (structure + expressions + references + view checks). */
export function validateFigure(input: unknown): { ok: true; figure: Figure; model: FigureModel } | { ok: false; errors: FigureIssue[] } {
  const v = validateSpec(input);
  if (!v.ok) return v;
  const c = compileFigure(v.figure);
  if (!c.ok) return c;
  return { ok: true, figure: v.figure, model: c.model };
}
