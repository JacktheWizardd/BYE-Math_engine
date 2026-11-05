import { z } from 'zod';

/** Spec version this engine understands. Figures without `spec` are treated as 0. */
export const SPEC_VERSION = 0;

export const ROLES = ['f', 'F', 'area', 'bound', 'note', 'text'] as const;
export const Role = z.enum(ROLES);

/** A number, or an expression string such as "f(1)" or "pi/2". */
export const Coord = z.union([z.number(), z.string().min(1)]);
export const Point = z.tuple([Coord, Coord]);

export const Range = z
  .tuple([z.number(), z.number()])
  .refine(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a < b, 'range must be [min, max] with min < max');

export const LABEL_POSITIONS = ['center', 'above', 'below', 'left', 'right', 'start', 'end'] as const;

export const Label = z.strictObject({
  text: z.string().min(1).optional(),
  tex: z.string().min(1).optional(),
  /** Number = x position along a function; keyword = placement relative to the element. */
  at: z.union([z.number(), z.enum(LABEL_POSITIONS)]).optional(),
}).refine((l) => (l.text === undefined) !== (l.tex === undefined), 'label needs exactly one of "text" or "tex"');

export const Id = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'id must be letters, digits or _ and start with a letter');

/** A position: [x, y] (numbers or expressions), or the id of a point element ("P"). */
export const PointRef = z.union([Point, Id]);

export const ANIMATION_KINDS = ['draw', 'fill', 'move', 'fade', 'grow'] as const;

/**
 * Motion when the figure appears. `true` uses the element's default kind:
 * draw (function, line, tangent, segment), fill (region), move (point on a curve),
 * grow (chart bars), fade (others).
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


/** Fields every element has. */
export const elementBase = {
  id: Id.optional(),
  label: Label.optional(),
  animate: Animate.optional(),
};

/** Fields every figure has. */
export const figureBase = {
  spec: z.literal(SPEC_VERSION).default(SPEC_VERSION),
  /** width / height. */
  aspect: z.number().positive().optional(),
  describe: z.string().trim().min(1, '"describe" is required (it is the accessibility label)'),
};

export type Role = z.infer<typeof Role>;
export type Coord = z.infer<typeof Coord>;
export type Point = z.infer<typeof Point>;
export type PointRef = z.infer<typeof PointRef>;
export type Animate = z.infer<typeof Animate>;
export type AnimationKind = (typeof ANIMATION_KINDS)[number];
export type Label = z.infer<typeof Label>;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];
