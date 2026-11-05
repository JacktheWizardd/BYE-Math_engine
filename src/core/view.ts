/** Math ⇄ pixel transforms. Pixel y grows downward, so math y is flipped. */
export type Vec = readonly [number, number];
export type Range = readonly [number, number];

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  /** Math ranges shown. */
  x: Range;
  y: Range;
  /** Whole canvas size in px. */
  width: number;
  height: number;
  /** Space between canvas edge and the plot area, in px. */
  padding: Padding;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function plotRect(vp: Viewport): Rect {
  const { padding: p } = vp;
  return { x: p.left, y: p.top, width: vp.width - p.left - p.right, height: vp.height - p.top - p.bottom };
}

/** Pixel position of a math point. */
export function toPx(vp: Viewport, [mx, my]: Vec): [number, number] {
  const r = plotRect(vp);
  const px = r.x + ((mx - vp.x[0]) / (vp.x[1] - vp.x[0])) * r.width;
  const py = r.y + r.height - ((my - vp.y[0]) / (vp.y[1] - vp.y[0])) * r.height;
  return [px, py];
}

/** Math position of a pixel. */
export function toMath(vp: Viewport, [px, py]: Vec): [number, number] {
  const r = plotRect(vp);
  const mx = vp.x[0] + ((px - r.x) / r.width) * (vp.x[1] - vp.x[0]);
  const my = vp.y[0] + ((r.y + r.height - py) / r.height) * (vp.y[1] - vp.y[0]);
  return [mx, my];
}

/** Pixels per math unit on each axis. */
export function scale(vp: Viewport): [number, number] {
  const r = plotRect(vp);
  return [r.width / (vp.x[1] - vp.x[0]), r.height / (vp.y[1] - vp.y[0])];
}

export const DEFAULT_ASPECT = 16 / 9;
