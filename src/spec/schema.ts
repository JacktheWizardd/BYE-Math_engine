import { z } from 'zod';

/** Spec version this engine understands. Figures without `spec` are treated as 0. */
export const SPEC_VERSION = 0;

export const ROLES = ['f', 'F', 'area', 'bound', 'note', 'text'] as const;
export const Role = z.enum(ROLES);

/** A number, or an expression string such as "f(1)" or "pi/2". */
export const Coord = z.union([z.number(), z.string().min(1)]);
export const Point = z.tuple([Coord, Coord]);

const Range = z
  .tuple([z.number(), z.number()])
  .refine(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a < b, 'range must be [min, max] with min < max');

export const LABEL_POSITIONS = ['center', 'above', 'below', 'left', 'right', 'start', 'end'] as const;

export const Label = z.strictObject({
  text: z.string().min(1).optional(),
  tex: z.string().min(1).optional(),
  /** Number = x position along a function; keyword = placement relative to the element. */
  at: z.union([z.number(), z.enum(LABEL_POSITIONS)]).optional(),
}).refine((l) => (l.text === undefined) !== (l.tex === undefined), 'label needs exactly one of "text" or "tex"');

const Id = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'id must be letters, digits or _ and start with a letter');

/** A position: [x, y] (numbers or expressions), or the id of a point element ("P"). */
export const PointRef = z.union([Point, Id]);

export const ANIMATION_KINDS = ['draw', 'fill', 'move', 'fade'] as const;

/**
 * Motion when the figure appears. `true` uses the element's default kind:
 * draw (function, line, tangent, segment), fill (region), move (point on a curve), fade (others).
 */
export const Animate = z.union([
  z.boolean(),
  z.strictObject({
    kind: z.enum(ANIMATION_KINDS).optional(),
    /** ms, default 700 */
    duration: z.number().positive().max(10000).optional(),
    /** ms, default 0 */
    delay: z.number().min(0).max(20000).optional(),
    /** For "move": the x the point starts from. */
    from: Coord.optional(),
  }),
]);

const base = {
  id: Id.optional(),
  label: Label.optional(),
  animate: Animate.optional(),
};

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

export const ELEMENT_TYPES = ['function', 'region', 'point', 'segment', 'line', 'text', 'mathLabel', 'tangent', 'intersection'] as const;

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
]);

export const Figure = z.strictObject({
  spec: z.literal(SPEC_VERSION).default(SPEC_VERSION),
  kind: z.literal('plot2d'),
  view: z.strictObject({ x: Range, y: Range }),
  /** width / height. Defaults to 16:9. */
  aspect: z.number().positive().optional(),
  grid: z
    .union([z.literal(false), z.strictObject({ x: z.number().positive().optional(), y: z.number().positive().optional() })])
    .optional(),
  axes: z
    .union([
      z.literal(false),
      z.strictObject({ x: z.boolean().default(true), y: z.boolean().default(true), labels: z.boolean().default(false) }),
    ])
    .optional(),
  elements: z.array(Element),
  describe: z.string().trim().min(1, '"describe" is required (it is the accessibility label)'),
});

export type Role = z.infer<typeof Role>;
export type Coord = z.infer<typeof Coord>;
export type Point = z.infer<typeof Point>;
export type PointRef = z.infer<typeof PointRef>;
export type Animate = z.infer<typeof Animate>;
export type AnimationKind = (typeof ANIMATION_KINDS)[number];
export type Label = z.infer<typeof Label>;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];
export type FunctionEl = z.infer<typeof FunctionEl>;
export type RegionEl = z.infer<typeof RegionEl>;
export type PointEl = z.infer<typeof PointEl>;
export type SegmentEl = z.infer<typeof SegmentEl>;
export type LineEl = z.infer<typeof LineEl>;
export type TextEl = z.infer<typeof TextEl>;
export type MathLabelEl = z.infer<typeof MathLabelEl>;
export type TangentEl = z.infer<typeof TangentEl>;
export type IntersectionEl = z.infer<typeof IntersectionEl>;
export type Element = z.infer<typeof Element>;
export type ElementType = Element['type'];
/** A validated figure (defaults filled in). */
export type Figure = z.infer<typeof Figure>;
/** The JSON a problem author writes (defaults optional). */
export type FigureInput = z.input<typeof Figure>;
