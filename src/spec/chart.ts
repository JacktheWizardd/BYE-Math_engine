import { z } from 'zod';
import { Animate, figureBase, Range, Role } from './common.ts';

const finite = z.number().refine(Number.isFinite, 'must be a finite number');

const chartBase = {
  ...figureBase,
  kind: z.literal('chart'),
  title: z.string().min(1).optional(),
  axes: z.strictObject({ x: z.string().min(1).optional(), y: z.string().min(1).optional() }).optional(),
  animate: Animate.optional(),
};

export const BarChart = z.strictObject({
  ...chartBase,
  type: z.literal('bar'),
  bars: z.array(z.strictObject({ label: z.string().min(1), value: finite, role: Role.optional() })).min(1, 'a bar chart needs at least one bar'),
  /** Top of the value axis (default: a round number above the largest bar). */
  max: z.number().positive().optional(),
});

export const HistogramChart = z
  .strictObject({
    ...chartBase,
    type: z.literal('histogram'),
    data: z.array(finite).min(1, 'a histogram needs at least one value').optional(),
    /** Bin count, { width, start? }, { edges }, or ready-made bins [{ from, to, count }]. */
    bins: z
      .union([
        z.number().int().positive(),
        z.strictObject({ width: z.number().positive(), start: finite.optional() }),
        z.strictObject({ edges: z.array(finite).min(2) }),
        z.array(z.strictObject({ from: finite, to: finite, count: z.number().int().min(0) })).min(1),
      ])
      .optional(),
  })
  .refine((h) => h.data !== undefined || Array.isArray(h.bins), 'histogram needs "data", or "bins" as a list of { from, to, count }');

export const BoxChart = z.strictObject({
  ...chartBase,
  type: z.literal('box'),
  groups: z.array(z.strictObject({ label: z.string().min(1).optional(), data: z.array(finite).min(1, 'a box plot group needs at least one value') })).min(1),
  /** Quartile method: "exclusive" (median of halves, the usual textbook/TI method) or "inclusive". */
  quartiles: z.enum(['exclusive', 'inclusive']).default('exclusive'),
  range: Range.optional(),
});

export const DotChart = z.strictObject({
  ...chartBase,
  type: z.literal('dot'),
  data: z.array(finite).min(1, 'a dot plot needs at least one value'),
  /** Values are rounded to this step before stacking (default 1). */
  step: z.number().positive().optional(),
  range: Range.optional(),
});

export const ScatterChart = z.strictObject({
  ...chartBase,
  type: z.literal('scatter'),
  points: z.array(z.tuple([finite, finite])).min(1, 'a scatter plot needs at least one point'),
  fit: z.literal('linear').optional(),
  /** Show the fitted equation (and r) as a label. Default true when fit is set. */
  showEquation: z.boolean().optional(),
  view: z.strictObject({ x: Range, y: Range }).optional(),
});

export const CHART_TYPES = ['bar', 'histogram', 'box', 'dot', 'scatter'] as const;

export const ChartFigure = z.discriminatedUnion('type', [BarChart, HistogramChart, BoxChart, DotChart, ScatterChart]);

export type BarChart = z.infer<typeof BarChart>;
export type HistogramChart = z.infer<typeof HistogramChart>;
export type BoxChart = z.infer<typeof BoxChart>;
export type DotChart = z.infer<typeof DotChart>;
export type ScatterChart = z.infer<typeof ScatterChart>;
export type ChartFigure = z.infer<typeof ChartFigure>;
