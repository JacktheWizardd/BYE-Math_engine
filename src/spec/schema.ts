import { z } from 'zod';
import { ChartFigure } from './chart.ts';
import { NumberLineFigure } from './numberLine.ts';
import { Plot2dFigure } from './plot2d.ts';
import { SignChartFigure } from './signChart.ts';

export * from './common.ts';
export * from './plot2d.ts';
export * from './numberLine.ts';
export * from './signChart.ts';
export * from './chart.ts';

export const FIGURE_KINDS = ['plot2d', 'numberLine', 'signChart', 'chart'] as const;

/** Any figure description, by `kind`. */
export const Figure = z.union([Plot2dFigure, NumberLineFigure, SignChartFigure, ChartFigure]);

/** A validated figure (defaults filled in). */
export type Figure = z.infer<typeof Figure>;
export type FigureKind = (typeof FIGURE_KINDS)[number];
/** The JSON a problem author writes (defaults optional). */
export type FigureInput = z.input<typeof Figure>;
