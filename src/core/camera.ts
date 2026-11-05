/**
 * Orbit camera around the normalised [-1, 1]³ box. The same matrices drive the
 * GL renderer (as a three.js PerspectiveCamera with identical settings) and the
 * label overlay, so labels stay locked to the picture while it rotates.
 * Matrices are column-major, as in WebGL/three.js.
 */
export type V3 = [number, number, number];
export type Mat4 = number[];

export interface Camera {
  /** Degrees around the z-axis, from +x. */
  azimuth: number;
  /** Degrees above the xy-plane. */
  elevation: number;
  zoom: number;
}

export const FOV = 30;
export const NEAR = 0.1;
export const FAR = 100;
/** Distance at zoom 1: the box's bounding sphere (radius √3) just fits the vertical field of view. */
export const BASE_DISTANCE = (Math.sqrt(3) / Math.sin((FOV / 2) * (Math.PI / 180))) * 1.02;

const rad = (d: number) => (d * Math.PI) / 180;

export function eyeOf(c: Camera): V3 {
  const t = rad(c.azimuth);
  const p = rad(Math.max(-89, Math.min(89, c.elevation)));
  const d = BASE_DISTANCE / c.zoom;
  return [d * Math.cos(p) * Math.cos(t), d * Math.cos(p) * Math.sin(t), d * Math.sin(p)];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** World → camera (gluLookAt; the camera looks down −z, z-up world). */
export function viewMatrix(eye: V3, target: V3 = [0, 0, 0], up: V3 = [0, 0, 1]): Mat4 {
  const zc = norm(sub(eye, target));
  const xc = norm(cross(up, zc));
  const yc = cross(zc, xc);
  return [xc[0], yc[0], zc[0], 0, xc[1], yc[1], zc[1], 0, xc[2], yc[2], zc[2], 0, -dot(xc, eye), -dot(yc, eye), -dot(zc, eye), 1];
}

/** Perspective projection (same as THREE.PerspectiveCamera). */
export function projectionMatrix(fovDeg: number, aspect: number, near = NEAR, far = FAR): Mat4 {
  const f = 1 / Math.tan(rad(fovDeg) / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

function mul4(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]! * v[3],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]! * v[3],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]! * v[3],
    m[3]! * v[0] + m[7]! * v[1] + m[11]! * v[2] + m[15]! * v[3],
  ];
}

export interface Projector {
  /** Pixel position (y down) and NDC depth of a normalised point. */
  project(p: V3): { x: number; y: number; depth: number };
  /** Inverse of project. */
  unproject(x: number, y: number, depth: number): V3;
}

export function projector(c: Camera, width: number, height: number): Projector {
  const v = viewMatrix(eyeOf(c));
  const pr = projectionMatrix(FOV, width / height);
  return {
    project(p) {
      const cam = mul4(v, [p[0], p[1], p[2], 1]);
      const clip = mul4(pr, cam);
      const nx = clip[0] / clip[3];
      const ny = clip[1] / clip[3];
      return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height, depth: clip[2] / clip[3] };
    },
    unproject(x, y, depth) {
      const nx = (x / width) * 2 - 1;
      const ny = 1 - (y / height) * 2;
      // invert projection: camera-space z from NDC depth, then x, y
      const A = pr[10]!;
      const B = pr[14]!;
      const zc = -B / (depth + A); // since depth = (A·z + B) / −z
      const xc = (nx * -zc) / pr[0]!;
      const yc = (ny * -zc) / pr[5]!;
      // invert the view matrix (rotation + translation)
      const r = [v[0]!, v[1]!, v[2]!, v[4]!, v[5]!, v[6]!, v[8]!, v[9]!, v[10]!];
      const t: V3 = [xc - v[12]!, yc - v[13]!, zc - v[14]!];
      return [r[0]! * t[0] + r[1]! * t[1] + r[2]! * t[2], r[3]! * t[0] + r[4]! * t[1] + r[5]! * t[2], r[6]! * t[0] + r[7]! * t[1] + r[8]! * t[2]];
    },
  };
}
