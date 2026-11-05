import { z } from 'zod';
import { Animate, Coord, figureBase, Id, Range } from './common.ts';

/** One row: an expression whose sign is shown, or ↗/↘ arrows ("trend") driven by its sign. */
export const SignRow = z.union([
  z.string().min(1),
  z.strictObject({
    expr: z.string().min(1),
    /** TeX for the row heading (default: the expression). */
    label: z.string().min(1).optional(),
    show: z.enum(['sign', 'trend']).default('sign'),
  }),
]);

export const SignChartFigure = z
  .strictObject({
    ...figureBase,
    kind: z.literal('signChart'),
    variable: z.string().regex(/^[a-z]$/, 'variable must be a single lowercase letter').default('x'),
    /** Named functions rows can use, e.g. { "f": "x^3 - 3x" } → rows "f'(x)". */
    functions: z.record(Id, z.string().min(1)).optional(),
    /** The expression to analyse (last row). */
    f: z.string().min(1).optional(),
    /** Factor rows shown above f. */
    factors: z.array(z.string().min(1)).optional(),
    /** Full control over the rows (instead of factors + f). */
    rows: z.array(SignRow).min(1).optional(),
    /** How to write particular critical points, e.g. { x: "sqrt(2)", tex: "\\sqrt{2}" }. */
    marks: z.array(z.strictObject({ x: Coord, tex: z.string().min(1) })).optional(),
    /** Where to look for critical points (default [-50, 50]). Columns are not to scale. */
    range: Range.optional(),
    animate: Animate.optional(),
  })
  .refine((s) => s.f !== undefined || s.rows !== undefined, 'sign chart needs "f" or "rows"');

export type SignRow = z.infer<typeof SignRow>;
export type SignChartFigure = z.infer<typeof SignChartFigure>;
