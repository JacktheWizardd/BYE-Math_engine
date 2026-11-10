import { z } from 'zod';
import { Coord, elementBase, figureBase, Id, PointRef, Range, Role } from './common.ts';

const base = elementBase;

export const FunctionEl = z.strictObject({
  ...base,
  type: z.literal('function'),
  y: z.string().min(1),
  domain: z.tuple([Coord, Coord]).optional(),
  role: Role.default('f'),
});

export const RegionEl = z
  .strictObject({
    ...base,
    type: z.literal('region'),
    under: Id.optional(),
    between: z.tuple([Id, Id]).optional(),
    from: Coord,
    to: Coord,
    role: Role.default('area'),
  })
  .refine((r) => (r.under === undefined) !== (r.between === undefined), 'region needs exactly one of "under" or "between"');

export const PointEl = z
  .strictObject({
    ...base,
    type: z.literal('point'),
    at: PointRef.optional(),
    on: Id.optional(),
    x: Coord.optional(),
    /** Open dot: a hole in the graph (the value there is not included). */
    open: z.boolean().optional(),
    role: Role.default('f'),
  })
  .refine(
    (p) => (p.at !== undefined && p.on === undefined && p.x === undefined) || (p.at === undefined && p.on !== undefined && p.x !== undefined),
    'point needs either "at" or both "on" and "x"',
  );

export const SegmentEl = z.strictObject({
  ...base,
  type: z.literal('segment'),
  from: PointRef,
  to: PointRef,
  role: Role.default('bound'),
});

export const LineEl = z
  .strictObject({
    ...base,
    type: z.literal('line'),
    through: z.tuple([PointRef, PointRef]).optional(),
    point: PointRef.optional(),
    slope: Coord.optional(),
    role: Role.default('f'),
  })
  .refine(
    (l) => (l.through !== undefined && l.point === undefined && l.slope === undefined) || (l.through === undefined && l.point !== undefined && l.slope !== undefined),
    'line needs either "through" or both "point" and "slope"',
  );

export const TextEl = z.strictObject({
  ...base,
  type: z.literal('text'),
  at: PointRef,
  text: z.string().min(1),
  role: Role.default('note'),
});

export const MathLabelEl = z.strictObject({
  ...base,
  type: z.literal('mathLabel'),
  at: PointRef,
  tex: z.string().min(1),
  role: Role.default('text'),
});

/** Tangent line to a function at x = at (full line in the view, or a segment of `length` centred on the touch point). */
export const TangentEl = z.strictObject({
  ...base,
  type: z.literal('tangent'),
  to: Id,
  at: Coord,
  /** Length along the line, in math units. Omit for a full line. */
  length: z.number().positive().optional(),
  role: Role.default('bound'),
});

/** Point where two curves/lines meet; one id = where it meets the x-axis. */
export const IntersectionEl = z.strictObject({
  ...base,
  type: z.literal('intersection'),
  of: z.union([z.tuple([Id]), z.tuple([Id, Id])]),
  /** Pick the hit closest to this x. */
  near: Coord.optional(),
  /** Otherwise pick by order, left to right (default 0). */
  index: z.number().int().min(0).optional(),
  role: Role.default('bound'),
});

/** Level curves f(x, y) = c (a contour map). */
export const ContourEl = z.strictObject({
  ...base,
  type: z.literal('contour'),
  /** Expression in x and y. */
  f: z.string().min(1),
  /** The levels c to draw, or how many round levels to pick (default 6). */
  levels: z.union([z.array(z.number().refine(Number.isFinite, 'must be a finite number')).min(1), z.number().int().min(1).max(30)]).optional(),
  /** Write each level's value on its curve. */
  labels: z.boolean().optional(),
  /** Grid cells per side for marching squares (default 64). */
  mesh: z.number().int().min(8).max(200).optional(),
  role: Role.default('F'),
});

/** An arrow from a point, to a point or by components (e.g. a gradient). */
export const VectorEl = z
  .strictObject({
    ...base,
    type: z.literal('vector'),
    from: PointRef,
    to: PointRef.optional(),
    components: z.tuple([Coord, Coord]).optional(),
    role: Role.default('bound'),
  })
  .refine((v) => (v.to === undefined) !== (v.components === undefined), 'vector needs exactly one of "to" or "components"');

export const ELEMENT_TYPES = ['function', 'region', 'point', 'segment', 'line', 'text', 'mathLabel', 'tangent', 'intersection', 'contour', 'vector'] as const;

export const Element = z.discriminatedUnion('type', [
  FunctionEl,
  RegionEl,
  PointEl,
  SegmentEl,
  LineEl,
  TextEl,
  MathLabelEl,
  TangentEl,
  IntersectionEl,
  ContourEl,
  VectorEl,
]);

export const Plot2dFigure = z.strictObject({
  ...figureBase,
  kind: z.literal('plot2d'),
  view: z.strictObject({ x: Range, y: Range }),
  grid: z
    .union([z.literal(false), z.strictObject({ x: z.number().positive().optional(), y: z.number().positive().optional() })])
    .optional(),
  axes: z
    .union([
      z.literal(false),
      z.strictObject({ x: z.boolean().default(true), y: z.boolean().default(true), labels: z.boolean().default(true) }),
    ])
    .optional(),
  elements: z.array(Element),
});


export type FunctionEl = z.infer<typeof FunctionEl>;
export type RegionEl = z.infer<typeof RegionEl>;
export type PointEl = z.infer<typeof PointEl>;
export type SegmentEl = z.infer<typeof SegmentEl>;
export type LineEl = z.infer<typeof LineEl>;
export type TextEl = z.infer<typeof TextEl>;
export type MathLabelEl = z.infer<typeof MathLabelEl>;
export type TangentEl = z.infer<typeof TangentEl>;
export type IntersectionEl = z.infer<typeof IntersectionEl>;
export type ContourEl = z.infer<typeof ContourEl>;
export type VectorEl = z.infer<typeof VectorEl>;
export type Element = z.infer<typeof Element>;
export type ElementType = Element['type'];
export type Plot2dFigure = z.infer<typeof Plot2dFigure>;
