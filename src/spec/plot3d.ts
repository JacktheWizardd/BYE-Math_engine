import { z } from 'zod';
import { Coord, elementBase, figureBase, Id, Range, Role } from './common.ts';

/** [x, y, z] (numbers or expressions). */
export const Point3 = z.tuple([Coord, Coord, Coord]);
/** [x, y, z] or the id of a point element ("P"). */
export const Point3Ref = z.union([Point3, Id]);
const Interval = z.tuple([Coord, Coord]);
const opacity = z.number().min(0.1).max(1).optional();
const mesh = z.number().int().min(4).max(80).optional();

/** Graph of z = f(x, y) over the view (or a region of it). Its id can be called f(a, b), with partials f_x, f_y… */
export const SurfaceEl = z.strictObject({
  ...elementBase,
  type: z.literal('surface'),
  z: z.string().min(1),
  /** Only where this holds, e.g. "x^2 + y^2 <= 4". */
  region: z.string().min(1).optional(),
  /** Grid cells per side (default 32). */
  mesh,
  opacity,
  role: Role.default('f'),
});

/** r(u, v) = (x, y, z). */
export const ParamSurfaceEl = z.strictObject({
  ...elementBase,
  type: z.literal('paramSurface'),
  x: z.string().min(1),
  y: z.string().min(1),
  z: z.string().min(1),
  u: Interval,
  v: Interval,
  mesh,
  opacity,
  role: Role.default('F'),
});

export const PlaneEl = z
  .strictObject({
    ...elementBase,
    type: z.literal('plane'),
    point: Point3Ref.optional(),
    normal: Point3.optional(),
    /** e.g. "x + y + z = 1" */
    equation: z.string().min(1).optional(),
    opacity,
    role: Role.default('bound'),
  })
  .refine((p) => (p.equation !== undefined) !== (p.point !== undefined && p.normal !== undefined), 'plane needs "equation", or both "point" and "normal"');

/** Tangent plane to a surface at (x0, y0), from its exact partial derivatives. */
export const TangentPlaneEl = z.strictObject({
  ...elementBase,
  type: z.literal('tangentPlane'),
  to: Id,
  at: Interval,
  /** Side of a square patch, in x/y units. Omit for the plane clipped to the view. */
  size: z.number().positive().optional(),
  opacity,
  role: Role.default('bound'),
});

/** Space curve r(t) = (x, y, z). */
export const CurveEl = z.strictObject({
  ...elementBase,
  type: z.literal('curve'),
  x: z.string().min(1),
  y: z.string().min(1),
  z: z.string().min(1),
  t: Interval,
  role: Role.default('f'),
});

export const Point3El = z
  .strictObject({
    ...elementBase,
    type: z.literal('point'),
    at: Point3Ref.optional(),
    /** A point on a surface: its id, and (x, y) in "over". */
    on: Id.optional(),
    over: Interval.optional(),
    role: Role.default('bound'),
  })
  .refine((p) => (p.at !== undefined) !== (p.on !== undefined && p.over !== undefined), 'point needs "at", or both "on" and "over"');

export const Vector3El = z
  .strictObject({
    ...elementBase,
    type: z.literal('vector'),
    from: Point3Ref,
    to: Point3Ref.optional(),
    components: Point3.optional(),
    role: Role.default('bound'),
  })
  .refine((v) => (v.to === undefined) !== (v.components === undefined), 'vector needs exactly one of "to" or "components"');

export const Segment3El = z.strictObject({
  ...elementBase,
  type: z.literal('segment'),
  from: Point3Ref,
  to: Point3Ref,
  role: Role.default('note'),
});

/** Level curves of f(x, y), drawn on the floor of the box. `f`: an expression in x and y, or a surface id. */
export const Contour3El = z.strictObject({
  ...elementBase,
  type: z.literal('contour'),
  f: z.string().min(1),
  levels: z.union([z.array(z.number().refine(Number.isFinite, 'must be a finite number')).min(1), z.number().int().min(1).max(30)]).optional(),
  role: Role.default('F'),
});

export const PLOT3D_ELEMENT_TYPES = ['surface', 'paramSurface', 'plane', 'tangentPlane', 'curve', 'point', 'vector', 'segment', 'contour'] as const;

export const Element3 = z.discriminatedUnion('type', [SurfaceEl, ParamSurfaceEl, PlaneEl, TangentPlaneEl, CurveEl, Point3El, Vector3El, Segment3El, Contour3El]);

export const Plot3dFigure = z.strictObject({
  ...figureBase,
  kind: z.literal('plot3d'),
  view: z.strictObject({ x: Range, y: Range, z: Range }),
  /** Degrees. azimuth: around the z-axis from +x; elevation: above the xy-plane. */
  camera: z
    .strictObject({
      azimuth: z.number().default(-55),
      elevation: z.number().min(-89).max(89).default(25),
      zoom: z.number().min(0.5).max(3).default(1),
    })
    .optional(),
  /** Drag to rotate (default true). */
  rotate: z.boolean().default(true),
  axes: z.strictObject({ labels: z.boolean().default(true), box: z.boolean().default(true) }).optional(),
  /** Same scale on all three axes (default: each axis fills the box). */
  equalAxes: z.boolean().default(false),
  elements: z.array(Element3),
});

export type Point3 = z.infer<typeof Point3>;
export type Point3Ref = z.infer<typeof Point3Ref>;
export type SurfaceEl = z.infer<typeof SurfaceEl>;
export type ParamSurfaceEl = z.infer<typeof ParamSurfaceEl>;
export type PlaneEl = z.infer<typeof PlaneEl>;
export type TangentPlaneEl = z.infer<typeof TangentPlaneEl>;
export type CurveEl = z.infer<typeof CurveEl>;
export type Point3El = z.infer<typeof Point3El>;
export type Vector3El = z.infer<typeof Vector3El>;
export type Segment3El = z.infer<typeof Segment3El>;
export type Contour3El = z.infer<typeof Contour3El>;
export type Element3 = z.infer<typeof Element3>;
export type Plot3dFigure = z.infer<typeof Plot3dFigure>;
