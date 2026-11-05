import { z } from 'zod';
import { Coord, elementBase, figureBase, Range, Role } from './common.ts';

/** Shaded solution set of an inequality, e.g. "-1 < x <= 3", "x < 0 or x >= 2", "x^2 - 4 > 0". */
export const InequalityEl = z.strictObject({
  ...elementBase,
  type: z.literal('inequality'),
  expr: z.string().min(1),
  role: Role.default('f'),
});

/** A shaded interval. A missing end is unbounded (drawn with an arrow). */
export const IntervalEl = z.strictObject({
  ...elementBase,
  type: z.literal('interval'),
  from: Coord.optional(),
  to: Coord.optional(),
  /** Whether each end is included (filled dot) or not (open dot). Default [true, true]. */
  closed: z.tuple([z.boolean(), z.boolean()]).optional(),
  role: Role.default('f'),
});

export const NumberLinePointEl = z.strictObject({
  ...elementBase,
  type: z.literal('point'),
  at: Coord,
  /** Open dot (value not included). */
  open: z.boolean().optional(),
  role: Role.default('bound'),
});

const side = z.enum(['above', 'below']).optional();

export const NumberLineTextEl = z.strictObject({
  ...elementBase,
  type: z.literal('text'),
  at: Coord,
  text: z.string().min(1),
  side,
  role: Role.default('note'),
});

export const NumberLineMathLabelEl = z.strictObject({
  ...elementBase,
  type: z.literal('mathLabel'),
  at: Coord,
  tex: z.string().min(1),
  side,
  role: Role.default('text'),
});

export const NUMBER_LINE_ELEMENT_TYPES = ['inequality', 'interval', 'point', 'text', 'mathLabel'] as const;

export const NumberLineElement = z.discriminatedUnion('type', [InequalityEl, IntervalEl, NumberLinePointEl, NumberLineTextEl, NumberLineMathLabelEl]);

export const NumberLineFigure = z.strictObject({
  ...figureBase,
  kind: z.literal('numberLine'),
  range: Range,
  /** Tick spacing (default: a round step). */
  ticks: z.number().positive().optional(),
  tickLabels: z.boolean().default(true),
  /** The variable used in inequalities. */
  variable: z.string().regex(/^[a-z]$/, 'variable must be a single lowercase letter').default('x'),
  elements: z.array(NumberLineElement),
});

export type InequalityEl = z.infer<typeof InequalityEl>;
export type IntervalEl = z.infer<typeof IntervalEl>;
export type NumberLinePointEl = z.infer<typeof NumberLinePointEl>;
export type NumberLineTextEl = z.infer<typeof NumberLineTextEl>;
export type NumberLineMathLabelEl = z.infer<typeof NumberLineMathLabelEl>;
export type NumberLineElement = z.infer<typeof NumberLineElement>;
export type NumberLineFigure = z.infer<typeof NumberLineFigure>;
