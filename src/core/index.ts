// Pure TypeScript math core. No React or rendering imports here.
export * from './view.ts';
export * from './sample.ts';
export * from './solve.ts';
export * from './theme.ts';
export * from './labels.ts';
export * from './model.ts';
export * from './layout.ts';
export * from './scene.ts';
export * from './figure.ts';
export * from './stats.ts';
export * from './fnTable.ts';
export * from './format.ts';
export * from './inequality.ts';
export * from './sign.ts';
export * from './animate.ts';

import { validateSpec, type Figure, type FigureIssue, type Plot2dFigure } from '../spec/index.ts';
import { figureToScene } from './figure.ts';
import { compileFigure, type FigureModel } from './model.ts';

/**
 * Full validation of any figure kind: structure, expressions, references,
 * computed values and layout. Never throws.
 */
export function validateFigure(input: unknown): { ok: true; figure: Figure } | { ok: false; errors: FigureIssue[] } {
  const v = validateSpec(input);
  if (!v.ok) return v;
  const s = figureToScene(input, { width: 338 });
  return s.ok ? { ok: true, figure: v.figure } : s;
}

/** Validate a plot2d figure and return its resolved model (functions, points, items). */
export function validatePlot2d(input: unknown): { ok: true; figure: Plot2dFigure; model: FigureModel } | { ok: false; errors: FigureIssue[] } {
  const v = validateSpec(input);
  if (!v.ok) return v;
  if (v.figure.kind !== 'plot2d') return { ok: false, errors: [{ path: 'kind', message: `expected a plot2d figure, got ${v.figure.kind}` }] };
  const c = compileFigure(v.figure);
  if (!c.ok) return c;
  return { ok: true, figure: v.figure, model: c.model };
}
