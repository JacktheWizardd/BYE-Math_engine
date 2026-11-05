import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { figureToScene3d, overlay3d, projector, timeline3d, type Scene3D, type V3 } from '../src/core/index.ts';

const load = (p: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../examples/${p}`), 'utf8'));
const W = 338;
const sceneOf = (fig: unknown): Scene3D => {
  const r = figureToScene3d(fig, { width: W });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const fromBox = (s: Scene3D, p: V3): V3 => {
  const h = (r: [number, number]) => (r[1] - r[0]) / 2;
  const m = (r: [number, number]) => (r[1] + r[0]) / 2;
  return [m(s.view.x) + p[0] * h(s.view.x), m(s.view.y) + p[1] * h(s.view.y), m(s.view.z) + p[2] * h(s.view.z)];
};
const verts = (pos: number[]): V3[] => Array.from({ length: pos.length / 3 }, (_, i) => [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!]);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(...a);

describe('surfaces', () => {
  it('normals are unit and agree with the mesh faces', () => {
    const s = sceneOf(load('figures/23-saddle.json'));
    const m = s.meshes[0]!;
    const P = verts(m.positions);
    const N = verts(m.normals);
    for (const n of N) expect(len(n)).toBeCloseTo(1, 9);
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
      const face = cross(sub(P[b]!, P[a]!), sub(P[c]!, P[a]!));
      const fn: V3 = face.map((q) => q / len(face)) as V3;
      expect(Math.abs(dot(fn, N[a]!))).toBeGreaterThan(0.95);
    }
  });

  it('a region keeps only points inside it', () => {
    const s = sceneOf(load('figures/24-paraboloid-contours.json'));
    for (const p of verts(s.meshes[0]!.positions)) {
      const [x, y] = fromBox(s, p);
      expect(x * x + y * y).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('undefined parts are left out (hemisphere)', () => {
    const s = sceneOf({ kind: 'plot3d', view: { x: [-1, 1], y: [-1, 1], z: [0, 1] }, elements: [{ type: 'surface', z: 'sqrt(1 - x^2 - y^2)' }], describe: 'hemisphere' });
    for (const p of verts(s.meshes[0]!.positions)) {
      const [x, y, z] = fromBox(s, p);
      expect(Number.isFinite(z)).toBe(true);
      expect(x * x + y * y).toBeLessThanOrEqual(1);
    }
  });

  it('floor contours sit on their levels', () => {
    const s = sceneOf(load('figures/24-paraboloid-contours.json'));
    const contour = s.lines.filter((l) => l.key.startsWith('el-1-'));
    expect(contour.length).toBe(4);
    for (const l of contour) {
      const r = l.points.map((p) => fromBox(s, p)).map(([x, y]) => x * x + y * y);
      const level = r[0]!;
      for (const v of r) expect(Math.abs(v - level)).toBeLessThan(1e-9);
      expect([0.5, 1, 2, 3].some((c) => Math.abs(c - level) < 1e-9)).toBe(true);
    }
  });
});

describe('planes', () => {
  it('tangent plane to 4 − x² − y² at (1, 1) is z = 2 − 2(x−1) − 2(y−1) and touches at P', () => {
    const s = sceneOf(load('figures/25-tangent-plane.json'));
    const plane = s.meshes[1]!;
    for (const p of verts(plane.positions)) {
      const [x, y, z] = fromBox(s, p);
      expect(z).toBeCloseTo(2 - 2 * (x - 1) - 2 * (y - 1), 9);
    }
    const P = fromBox(s, s.dots[0]!.at);
    expect(P[0]).toBeCloseTo(1, 12);
    expect(P[1]).toBeCloseTo(1, 12);
    expect(P[2]).toBeCloseTo(2, 12);
  });

  it('a plane clipped to the box: vertices on the plane and on the box faces', () => {
    const s = sceneOf(load('figures/27-plane.json'));
    const pts = verts(s.meshes[0]!.positions);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    for (const p of pts) {
      const [x, y, z] = fromBox(s, p);
      expect(x + y + z).toBeCloseTo(1, 9);
      expect(p.some((q) => Math.abs(Math.abs(q) - 1) < 1e-9)).toBe(true);
    }
  });
});

describe('curves and vectors', () => {
  it('helix samples satisfy x² + y² = 1 and the tangent vector is r′(π)', () => {
    const s = sceneOf(load('figures/26-helix.json'));
    const curve = s.lines.find((l) => l.key.startsWith('el-0'))!;
    for (const p of curve.points) {
      const [x, y] = fromBox(s, p);
      expect(x * x + y * y).toBeCloseTo(1, 9);
    }
    const a = s.arrows[0]!;
    const from = fromBox(s, a.from);
    const to = fromBox(s, a.to);
    expect(to[0] - from[0]).toBeCloseTo(0, 9);
    expect(to[1] - from[1]).toBeCloseTo(-1, 9);
    expect(to[2] - from[2]).toBeCloseTo(0.25, 9);
  });
});

describe('camera and overlay', () => {
  it('project / unproject round-trip, origin at the centre', () => {
    const cam = { azimuth: -55, elevation: 25, zoom: 1 };
    const pr = projector(cam, 338, 300);
    const o = pr.project([0, 0, 0]);
    expect(o.x).toBeCloseTo(169, 9);
    expect(o.y).toBeCloseTo(150, 9);
    for (const p of [[0.3, -0.7, 0.9], [-1, 1, -1], [0.5, 0.5, 0]] as V3[]) {
      const q = pr.project(p);
      const back = pr.unproject(q.x, q.y, q.depth);
      back.forEach((v, k) => expect(v).toBeCloseTo(p[k]!, 9));
    }
  });

  it('labels stay inside the figure and follow the camera', () => {
    const s = sceneOf(load('figures/25-tangent-plane.json'));
    const a = overlay3d(s, s.camera);
    const b = overlay3d(s, { ...s.camera, azimuth: s.camera.azimuth + 60 });
    for (const p of [...a, ...b]) {
      if (p.kind !== 'text' && p.kind !== 'mathLabel') continue;
      expect(p.box.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.box.x + p.box.width).toBeLessThanOrEqual(s.width + 1e-9);
    }
    const pa = a.find((p) => p.key === 'label-2');
    const pb = b.find((p) => p.key === 'label-2');
    expect(pa && pb && pa.kind === 'text' && pb.kind === 'text' && pa.x !== pb.x).toBe(true);
  });
});

describe('every 3D figure', () => {
  const files = readdirSync(join(import.meta.dirname, '../examples/figures')).filter((f) => f.startsWith('2') && JSON.parse(readFileSync(join(import.meta.dirname, `../examples/figures/${f}`), 'utf8')).kind === 'plot3d');
  it.each(files)('%s builds', (f) => {
    const s = sceneOf(load(`figures/${f}`));
    expect(s.meshes.length + s.lines.length).toBeGreaterThan(0);
  });
  it('the animated one has a timeline', () => {
    const s = sceneOf(load('figures/30-surface-grows.json'));
    expect(timeline3d(s)).toBe(1200);
    expect(s.meshes[0]!.anim?.kind).toBe('grow');
  });
});

describe('3D bad input', () => {
  const msg = (f: string) => {
    const r = figureToScene3d(load(`bad/${f}`), { width: W });
    return r.ok ? '' : r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  };
  it.each([
    ['3d-unknown-surface.json', /No element with id "g"/],
    ['3d-empty-region.json', /leaves nothing of the surface/],
    ['3d-plane-outside.json', /misses the view box/],
    ['3d-tangent-cusp.json', /no tangent plane at \(0, 0\)/],
  ])('%s', (f, re) => {
    expect(msg(f)).toMatch(re);
  });
});

describe('region edges are cut exactly', () => {
  // Boundary edges of the triangle mesh (used by one triangle) must all lie on the circle x² + y² = 4,
  // at a coarse mesh too — no notches where whole triangles were dropped.
  it.each([8, 16, 40])('paraboloid over the disk, mesh %d', (mesh) => {
    const fig = load('figures/24-paraboloid-contours.json');
    fig.elements[0].mesh = mesh;
    const s = sceneOf(fig);
    const m = s.meshes[0]!;
    const P = verts(m.positions).map((p) => fromBox(s, p));
    const uses = new Map<string, number>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const tri = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
      for (let e = 0; e < 3; e++) {
        const [a, b] = [tri[e]!, tri[(e + 1) % 3]!].sort((p, q) => p - q);
        uses.set(`${a},${b}`, (uses.get(`${a},${b}`) ?? 0) + 1);
      }
    }
    const boundary = [...uses].filter(([, c]) => c === 1).flatMap(([k]) => k.split(',').map(Number));
    expect(boundary.length).toBeGreaterThan(0);
    for (const v of boundary) {
      const [x, y] = P[v]!;
      expect(Math.abs(x * x + y * y - 4)).toBeLessThan(1e-9);
    }
    for (const [x, y] of P) expect(x * x + y * y).toBeLessThanOrEqual(4 + 1e-9);
  });
});
