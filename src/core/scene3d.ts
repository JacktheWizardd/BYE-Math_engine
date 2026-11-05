import type { FigureIssue } from '../spec/index.ts';
import type { Camera, V3 } from './camera.ts';
import type { AnyRole, ByeTheme } from './theme.ts';

/**
 * A 3D figure, ready for any renderer (GL today). Geometry is in the normalised
 * box [-1, 1]³ (`toBox` maps math → box). Nothing here depends on three.js.
 */
export type Anim3 = { kind: 'draw' | 'fade' | 'grow'; delay: number; duration: number };

export interface Mesh3 {
  key: string;
  role: AnyRole;
  opacity: number;
  /** xyz per vertex, box coordinates. */
  positions: number[];
  /** Unit normals per vertex, box coordinates. */
  normals: number[];
  /** Triangles. */
  indices: number[];
  /** For `grow`: the box z each vertex rises from. */
  baseZ?: number;
  anim?: Anim3;
}

export interface Line3 {
  key: string;
  role: AnyRole | 'grid' | 'axis';
  /** One unbroken polyline, box coordinates. */
  points: V3[];
  /** px (CSS) */
  width: number;
  /** For `grow` (a surface's mesh lines): the box z the line rises from. */
  baseZ?: number;
  anim?: Anim3;
}

export interface Arrow3 {
  key: string;
  role: AnyRole;
  from: V3;
  to: V3;
  anim?: Anim3;
}

export interface Dot3 {
  key: string;
  role: AnyRole;
  at: V3;
  anim?: Anim3;
}

export interface Label3 {
  key: string;
  at: V3;
  text?: string;
  tex?: string;
  role: AnyRole;
  anim?: Anim3;
}

export interface Scene3D {
  kind: 'scene3d';
  width: number;
  height: number;
  describe: string;
  theme: ByeTheme;
  camera: Camera;
  rotate: boolean;
  view: { x: [number, number]; y: [number, number]; z: [number, number] };
  /** math → box */
  toBox(p: readonly [number, number, number]): V3;
  meshes: Mesh3[];
  lines: Line3[];
  arrows: Arrow3[];
  dots: Dot3[];
  labels: Label3[];
  /** Tick values per axis (math units), for the overlay. */
  ticks: { x: number[]; y: number[]; z: number[] };
  showBox: boolean;
  tickLabels: boolean;
}

export type Scene3DResult = { ok: true; scene: Scene3D } | { ok: false; errors: FigureIssue[] };

/** Total animation time in ms. */
export function timeline3d(s: Scene3D): number {
  let end = 0;
  for (const g of [...s.meshes, ...s.lines, ...s.arrows, ...s.dots, ...s.labels]) if (g.anim) end = Math.max(end, g.anim.delay + g.anim.duration);
  return end;
}

/** Eased progress 0..1 of an animated piece at time ms (1 when it has no animation). */
export function progress3d(a: Anim3 | undefined, ms: number): number {
  if (!a) return 1;
  const t = Math.min(1, Math.max(0, (ms - a.delay) / a.duration));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
