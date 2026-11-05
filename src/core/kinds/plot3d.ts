import { compile, derive, ExprError, isReservedName, NoSymbolicDerivative, parseExpr, referencedIds, type FnN, type Node } from '../../expr/index.ts';
import type { Coord, Element3, FigureIssue, Plot3dFigure, Point3Ref } from '../../spec/index.ts';
import type { V3 } from '../camera.ts';
import { autoLevels, contourLines, sampleGrid, type Fxy } from '../contour.ts';
import { inequalityPredicate, parseComparisons } from '../inequality.ts';
import type { SceneOptions } from '../layout.ts';
import type { Anim3, Arrow3, Dot3, Label3, Line3, Mesh3, Scene3D, Scene3DResult } from '../scene3d.ts';
import { ByeLightTheme, type AnyRole } from '../theme.ts';
import { ticks } from '../layout.ts';

type M3 = [number, number, number];
const DEFAULT_MESH = 32;
const CURVE_SAMPLES = 360;

const exprMessage = (e: unknown) => (e instanceof ExprError ? e.describe() : String((e as Error)?.message ?? e));

/**
 * Lays out a plot3d figure: resolves elements in dependency order, builds
 * meshes, lines, arrows and dots in the normalised box, and checks values.
 * Never throws.
 */
export function plot3dScene(fig: Plot3dFigure, opts: SceneOptions): Scene3DResult {
  try {
    return build(fig, opts);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Internal error: ${exprMessage(e)}` }] };
  }
}

function build(fig: Plot3dFigure, opts: SceneOptions): Scene3DResult {
  const errors: FigureIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const at = (i: number, f?: string) => `elements[${i}]${f ? `.${f}` : ''}`;
  const els = fig.elements;
  const { view } = fig;

  // --- ids and kinds
  const ids = new Map<string, number>();
  els.forEach((el, i) => {
    if (!el.id) return;
    if (isReservedName(el.id) || el.id === 'y' || el.id === 'z' || el.id === 't' || el.id === 'u' || el.id === 'v') err(at(i, 'id'), `"${el.id}" is a reserved name`);
    if (ids.has(el.id)) err(at(i, 'id'), `Duplicate id "${el.id}" (also elements[${ids.get(el.id)}])`);
    ids.set(el.id, i);
  });
  const kindOf = (id: string) => (ids.has(id) ? els[ids.get(id)!]!.type : undefined);
  const surfaceIds = [...ids.keys()].filter((id) => kindOf(id) === 'surface');
  const pointIds = [...ids.keys()].filter((id) => kindOf(id) === 'point');
  const others = new Map([...ids.keys()].filter((id) => !surfaceIds.includes(id) && !pointIds.includes(id)).map((id) => [id, kindOf(id)!]));
  const scope = (variables: string[]) => ({ variables, functions: [], functions2: surfaceIds, points: pointIds, others });

  // --- parse expressions; collect dependencies
  const nodes = new Map<string, Node>();
  const deps: Set<string>[] = els.map(() => new Set());
  const parseAt = (i: number, path: string, src: string, vars: string[]) => {
    try {
      const n = parseExpr(src, scope(vars));
      nodes.set(path, n);
      referencedIds(n).forEach((d) => deps[i]!.add(d));
    } catch (e) {
      err(path, exprMessage(e));
    }
  };
  const coordAt = (i: number, path: string, c: Coord | undefined) => {
    if (typeof c === 'string') parseAt(i, path, c, []);
  };
  const refAt = (i: number, path: string, id: string, kinds: string[], what: string) => {
    const k = kindOf(id);
    if (k === undefined) err(path, `No element with id "${id}"`);
    else if (!kinds.includes(k)) err(path, `"${id}" is a ${k}, not a ${what}`);
    else deps[i]!.add(id);
  };
  const pointRefAt = (i: number, path: string, p: Point3Ref | undefined) => {
    if (p === undefined) return;
    if (typeof p === 'string') return refAt(i, path, p, ['point'], 'point');
    p.forEach((c, k) => coordAt(i, `${path}[${k}]`, c));
  };
  els.forEach((el, i) => {
    switch (el.type) {
      case 'surface':
        parseAt(i, at(i, 'z'), el.z, ['x', 'y']);
        break;
      case 'paramSurface':
        for (const c of ['x', 'y', 'z'] as const) parseAt(i, at(i, c), el[c], ['u', 'v']);
        el.u.forEach((c, k) => coordAt(i, at(i, `u[${k}]`), c));
        el.v.forEach((c, k) => coordAt(i, at(i, `v[${k}]`), c));
        break;
      case 'plane':
        pointRefAt(i, at(i, 'point'), el.point);
        el.normal?.forEach((c, k) => coordAt(i, at(i, `normal[${k}]`), c));
        break;
      case 'tangentPlane':
        refAt(i, at(i, 'to'), el.to, ['surface'], 'surface');
        el.at.forEach((c, k) => coordAt(i, at(i, `at[${k}]`), c));
        break;
      case 'curve':
        for (const c of ['x', 'y', 'z'] as const) parseAt(i, at(i, c), el[c], ['t']);
        el.t.forEach((c, k) => coordAt(i, at(i, `t[${k}]`), c));
        break;
      case 'point':
        pointRefAt(i, at(i, 'at'), el.at);
        if (el.on) refAt(i, at(i, 'on'), el.on, ['surface'], 'surface');
        el.over?.forEach((c, k) => coordAt(i, at(i, `over[${k}]`), c));
        break;
      case 'vector':
        pointRefAt(i, at(i, 'from'), el.from);
        pointRefAt(i, at(i, 'to'), el.to);
        el.components?.forEach((c, k) => coordAt(i, at(i, `components[${k}]`), c));
        break;
      case 'segment':
        pointRefAt(i, at(i, 'from'), el.from);
        pointRefAt(i, at(i, 'to'), el.to);
        break;
      case 'contour':
        if (surfaceIds.includes(el.f.trim())) deps[i]!.add(el.f.trim());
        else parseAt(i, at(i, 'f'), el.f, ['x', 'y']);
        break;
    }
  });
  if (errors.length) return { ok: false, errors };

  // --- dependency order
  const order: number[] = [];
  const state = els.map(() => 0);
  const name = (i: number) => els[i]!.id ?? `elements[${i}]`;
  const visit = (i: number, trail: number[]): boolean => {
    if (state[i] === 2) return true;
    if (state[i] === 1) {
      err(at(i), `Circular definition: ${[...trail.slice(trail.indexOf(i)), i].map(name).join(' → ')}`);
      return false;
    }
    state[i] = 1;
    for (const d of deps[i]!) {
      const j = ids.get(d);
      if (j !== undefined && !visit(j, [...trail, i])) return false;
    }
    state[i] = 2;
    order.push(i);
    return true;
  };
  for (let i = 0; i < els.length; i++) if (!visit(i, [])) return { ok: false, errors };

  // --- tables: surfaces as two-variable functions (with partials), points
  const surfaceNode = (id: string) => nodes.get(at(ids.get(id)!, 'z'));
  const fn2Cache = new Map<string, Fxy>();
  const points = new Map<string, M3>();
  const pointTable = (id: string) => points.get(id);
  const table2 = (id: string, partial: string): Fxy | undefined => {
    const key = `${id}:${partial}`;
    if (fn2Cache.has(key)) return fn2Cache.get(key);
    let node = surfaceNode(id);
    if (!node) return undefined;
    let f: Fxy;
    try {
      for (const c of partial) node = derive(node, c);
      f = compile(node, undefined, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy;
    } catch (e) {
      if (!(e instanceof NoSymbolicDerivative)) throw e;
      const prev = table2(id, partial.slice(0, -1))!;
      const h = 1e-5;
      f = partial.endsWith('x') ? (x, y) => (prev(x + h, y) - prev(x - h, y)) / (2 * h) : (x, y) => (prev(x, y + h) - prev(x, y - h)) / (2 * h);
    }
    fn2Cache.set(key, f);
    return f;
  };
  const fnOf = (path: string, vars: string[]): FnN | null => {
    const n = nodes.get(path);
    return n ? compile(n, undefined, pointTable, { vars, functions2: table2 }) : null;
  };
  const num = (c: Coord, path: string): number => {
    if (typeof c === 'number') return c;
    const f = fnOf(path, []);
    const v = f ? f(NaN) : NaN;
    if (!Number.isFinite(v)) err(path, `"${c}" is not a finite number`);
    return v;
  };
  const vec = (p: Point3Ref, path: string): M3 => (typeof p === 'string' ? (points.get(p) ?? [NaN, NaN, NaN]) : [num(p[0], `${path}[0]`), num(p[1], `${path}[1]`), num(p[2], `${path}[2]`)]);

  // --- box mapping
  const half: M3 = [(view.x[1] - view.x[0]) / 2, (view.y[1] - view.y[0]) / 2, (view.z[1] - view.z[0]) / 2];
  const mid: M3 = [(view.x[1] + view.x[0]) / 2, (view.y[1] + view.y[0]) / 2, (view.z[1] + view.z[0]) / 2];
  const h: M3 = fig.equalAxes ? [Math.max(...half), Math.max(...half), Math.max(...half)] : half;
  const toBox = (p: readonly [number, number, number]): V3 => [(p[0] - mid[0]) / h[0], (p[1] - mid[1]) / h[1], (p[2] - mid[2]) / h[2]];
  const inView = (p: M3) => p[0] >= view.x[0] - 1e-9 && p[0] <= view.x[1] + 1e-9 && p[1] >= view.y[0] - 1e-9 && p[1] <= view.y[1] + 1e-9 && p[2] >= view.z[0] - 1e-9 && p[2] <= view.z[1] + 1e-9;
  const fmt = (p: M3) => `(${p.map((v) => +v.toFixed(4)).join(', ')})`;

  const meshes: Mesh3[] = [];
  const lines: Line3[] = [];
  const arrows: Arrow3[] = [];
  const dots: Dot3[] = [];
  const labels: Label3[] = [];

  const animOf = (el: Element3, i: number): Anim3 | undefined => {
    const a = el.animate;
    if (!a) return undefined;
    const o = typeof a === 'object' ? a : {};
    const natural = el.type === 'surface' ? 'grow' : ['curve', 'vector', 'segment', 'contour'].includes(el.type) ? 'draw' : 'fade';
    const kind = o.kind ?? natural;
    const allowed = kind === 'fade' || (kind === 'grow' && el.type === 'surface') || (kind === 'draw' && ['curve', 'vector', 'segment', 'contour'].includes(el.type));
    if (!allowed) {
      err(at(i, 'animate.kind'), `"${kind}" doesn't apply to a ${el.type}`);
      return undefined;
    }
    return { kind: kind as Anim3['kind'], delay: o.delay ?? 0, duration: o.duration ?? 900 };
  };
  const labelAt = (el: Element3, i: number, anchor: V3, anim?: Anim3) => {
    if (!el.label) return;
    const la: Anim3 | undefined = anim ? { kind: 'fade', delay: anim.delay + anim.duration, duration: 250 } : undefined;
    labels.push({ key: `label-${i}`, at: anchor, role: el.role as AnyRole, ...(el.label.tex !== undefined ? { tex: el.label.tex } : { text: el.label.text! }), ...(la ? { anim: la } : {}) });
  };

  /** Mesh over a parameter grid. r returns math coords (NaN = hole); keep(i, j) can drop vertices. */
  /**
   * Mesh over a parameter grid. r returns math coords (NaN = hole); keep(p, s, t) limits it to a region.
   * Cells that straddle the edge of the region (or of where r is defined) are cut exactly along it:
   * crossing points are found by bisection on each grid edge and shared between neighbouring cells,
   * so rims are smooth and the mesh stays watertight at any mesh size.
   */
  const gridMesh = (key: string, role: AnyRole, opacity: number, n: number, r: (s: number, t: number) => M3, normalAt: (s: number, t: number, p: M3) => V3 | null, sr: [number, number], tr: [number, number], keep?: (p: M3, s: number, t: number) => boolean, anim?: Anim3) => {
    const param = (k: number, j: number): [number, number] => [sr[0] + ((sr[1] - sr[0]) * k) / n, tr[0] + ((tr[1] - tr[0]) * j) / n];
    const inside = (s: number, t: number) => {
      const p = r(s, t);
      return p.every(Number.isFinite) && (!keep || keep(p, s, t));
    };
    const ok: boolean[] = [];
    for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) ok.push(inside(...param(k, j)));
    const at = (k: number, j: number) => ok[j * (n + 1) + k]!;

    const positions: number[] = [];
    const normals: number[] = [];
    const vertexOf = new Map<string, number>();
    const pointOf: V3[] = [];
    const addVertex = (key: string, s: number, t: number): number => {
      const hit = vertexOf.get(key);
      if (hit !== undefined) return hit;
      const p = r(s, t);
      const v = toBox(p);
      const id = positions.length / 3;
      positions.push(...v);
      normals.push(...(normalAt(s, t, p) ?? [0, 0, 1]));
      pointOf.push(v);
      vertexOf.set(key, id);
      return id;
    };
    const corner = (k: number, j: number) => addVertex(`c${k},${j}`, ...param(k, j));
    /** Crossing on the grid edge from (k, j) to (k2, j2); bisection keeps the inside end, so it lies in the region. */
    const crossing = (ka: number, ja: number, kb: number, jb: number) => {
      // key by the lower end so both neighbouring cells share the vertex
      const [k, j, k2, j2] = kb > ka || jb > ja ? [ka, ja, kb, jb] : [kb, jb, ka, ja];
      const key = k2 > k ? `h${k},${j}` : `v${k},${j}`;
      if (vertexOf.has(key)) return vertexOf.get(key)!;
      let [is, it] = param(k, j);
      let [os, ot] = param(k2, j2);
      if (!at(k, j)) [is, it, os, ot] = [os, ot, is, it];
      for (let q = 0; q < 48; q++) {
        const ms = (is + os) / 2, mt = (it + ot) / 2;
        if (inside(ms, mt)) [is, it] = [ms, mt];
        else [os, ot] = [ms, mt];
      }
      return addVertex(key, is, it);
    };

    const indices: number[] = [];
    const fan = (poly: number[]) => {
      for (let q = 1; q < poly.length - 1; q++) indices.push(poly[0]!, poly[q]!, poly[q + 1]!);
    };
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        // corners counter-clockwise: (k,j) (k+1,j) (k+1,j+1) (k,j+1)
        const cs: [number, number][] = [[k, j], [k + 1, j], [k + 1, j + 1], [k, j + 1]];
        const ins = cs.map(([a, b]) => at(a, b));
        const count = ins.filter(Boolean).length;
        if (count === 0) continue;
        if (count === 4) {
          fan(cs.map(([a, b]) => corner(a, b)));
          continue;
        }
        if (count === 2 && ins[0] === ins[2]) {
          // opposite corners inside (saddle case): a small triangle at each inside corner
          cs.forEach(([a, b], q) => {
            if (!ins[q]) return;
            const [pa, pb] = cs[(q + 3) % 4]!;
            const [na, nb] = cs[(q + 1) % 4]!;
            fan([crossing(pa, pb, a, b), corner(a, b), crossing(a, b, na, nb)]);
          });
          continue;
        }
        // walk the cell boundary: inside corners, plus a crossing wherever an edge leaves or enters
        const poly: number[] = [];
        cs.forEach(([a, b], q) => {
          const [c2, d2] = cs[(q + 1) % 4]!;
          if (ins[q]) poly.push(corner(a, b));
          if (ins[q] !== ins[(q + 1) % 4]) poly.push(crossing(a, b, c2, d2));
        });
        if (poly.length >= 3) fan(poly);
      }
    }
    if (!indices.length) return false;
    meshes.push({ key, role, opacity, positions, normals, indices, ...(anim ? { anim } : {}) });

    // mesh lines every few grid lines, cut at the same crossings
    const every = Math.max(1, Math.round(n / 8));
    let q = 0;
    const emit = (cur: V3[]) => {
      if (cur.length > 1) lines.push({ key: `${key}-mesh-${q++}`, role, points: cur, width: 0.75, ...(anim ? { anim } : {}) });
    };
    const trace = (cellAt: (m: number) => [number, number]) => {
      let cur: V3[] = [];
      for (let m = 0; m <= n; m++) {
        const [a, b] = cellAt(m);
        if (at(a, b)) cur.push(pointOf[corner(a, b)]!);
        if (m < n) {
          const [c2, d2] = cellAt(m + 1);
          if (at(a, b) !== at(c2, d2)) {
            cur.push(pointOf[crossing(a, b, c2, d2)]!);
            if (at(a, b)) {
              emit(cur);
              cur = [];
            }
          }
        }
      }
      emit(cur);
    };
    for (let j = 0; j <= n; j += every) trace((m) => [m, j]);
    for (let k = 0; k <= n; k += every) trace((m) => [k, m]);
    return true;
  };

  const unit = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l > 0 && Number.isFinite(l) ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1];
  };
  const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** Normal in box coordinates from math tangent vectors. */
  const boxNormal = (ru: M3, rv: M3): V3 => unit(crossV([ru[0] / h[0], ru[1] / h[1], ru[2] / h[2]], [rv[0] / h[0], rv[1] / h[1], rv[2] / h[2]]));

  /** Plane n·p = d clipped to the view box: convex polygon (math coords), or null if it misses. */
  const planePolygon = (n: M3, d: number): M3[] | null => {
    const xs = view.x, ys = view.y, zs = view.z;
    const corners: M3[] = [];
    for (const x of xs) for (const y of ys) for (const z of zs) corners.push([x, y, z]);
    const edges: [number, number][] = [];
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const diff = [0, 1, 2].filter((k) => corners[a]![k] !== corners[b]![k]).length;
      if (diff === 1) edges.push([a, b]);
    }
    const pts: M3[] = [];
    const add = (p: M3) => {
      if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-9)) pts.push(p);
    };
    for (const [ia, ib] of edges) {
      const A = corners[ia]!, B = corners[ib]!;
      const sa = n[0] * A[0] + n[1] * A[1] + n[2] * A[2] - d;
      const sb = n[0] * B[0] + n[1] * B[1] + n[2] * B[2] - d;
      if (sa === 0) add(A);
      if (sb === 0) add(B);
      if (sa * sb < 0) {
        const t = sa / (sa - sb);
        add([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
      }
    }
    if (pts.length < 3) return null;
    const c: M3 = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k]!, 0) / pts.length) as M3;
    const nn = unit(n);
    const u0 = unit(Math.abs(nn[0]) < 0.9 ? crossV(nn, [1, 0, 0]) : crossV(nn, [0, 1, 0]));
    const w0 = crossV(nn, u0);
    const ang = (p: M3) => {
      const v: M3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      return Math.atan2(v[0] * w0[0] + v[1] * w0[1] + v[2] * w0[2], v[0] * u0[0] + v[1] * u0[1] + v[2] * u0[2]);
    };
    return pts.sort((p, q) => ang(p) - ang(q));
  };
  const polygonMesh = (key: string, role: AnyRole, opacity: number, poly: M3[], n: M3, anim?: Anim3) => {
    const nb = boxNormal(...perp(n));
    const positions = poly.flatMap((p) => toBox(p));
    const normals = poly.flatMap(() => nb);
    const indices: number[] = [];
    for (let k = 1; k < poly.length - 1; k++) indices.push(0, k, k + 1);
    meshes.push({ key, role, opacity, positions, normals, indices, ...(anim ? { anim } : {}) });
    lines.push({ key: `${key}-edge`, role, points: [...poly, poly[0]!].map((p) => toBox(p)), width: 1, ...(anim ? { anim } : {}) });
  };
  /** Two tangent vectors of a plane with normal n (so boxNormal(…) gives the box normal). */
  const perp = (n: M3): [M3, M3] => {
    const a = unit(Math.abs(n[0]) < 0.9 ? crossV(n as V3, [1, 0, 0]) : crossV(n as V3, [0, 1, 0]));
    const b = crossV(n as V3, a);
    return [a as M3, b as M3];
  };

  // --- evaluate in dependency order
  for (const i of order) {
    const el = els[i]!;
    const key = `el-${i}`;
    const role = el.role as AnyRole;
    const anim = animOf(el, i);
    const opacity = 'opacity' in el && el.opacity !== undefined ? el.opacity : 0.92;
    switch (el.type) {
      case 'surface': {
        const f = el.id ? table2(el.id, '')! : (compile(nodes.get(at(i, 'z'))!, undefined, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy);
        const fx = el.id ? table2(el.id, 'x')! : (compile(derive(nodes.get(at(i, 'z'))!, 'x'), undefined, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy);
        const fy = el.id ? table2(el.id, 'y')! : (compile(derive(nodes.get(at(i, 'z'))!, 'y'), undefined, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy);
        let region: ((a: number, b?: number) => boolean) | undefined;
        if (el.region) {
          try {
            region = inequalityPredicate(el.region, ['x', 'y'], { functions2: surfaceIds, points: pointIds }, { functions2: table2 });
          } catch (e) {
            err(at(i, 'region'), exprMessage(e));
            break;
          }
        }
        const n = el.mesh ?? DEFAULT_MESH;
        const ok = gridMesh(
          key, role, opacity, n,
          (x, y) => [x, y, f(x, y)],
          (x, y) => {
            let gx = fx(x, y), gy = fy(x, y);
            if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
              const e = 1e-5;
              gx = (f(x + e, y) - f(x - e, y)) / (2 * e);
              gy = (f(x, y + e) - f(x, y - e)) / (2 * e);
            }
            return boxNormal([1, 0, gx], [0, 1, gy]);
          },
          [view.x[0], view.x[1]], [view.y[0], view.y[1]],
          region ? (_p, x, y) => region!(x, y) : undefined,
          anim,
        );
        if (!ok) {
          err(at(i), el.region ? `region "${el.region}" leaves nothing of the surface inside the view` : `"${el.z}" is not defined anywhere in the view`);
          break;
        }
        const m = meshes[meshes.length - 1]!;
        m.baseZ = toBox([0, 0, Math.min(view.z[1], Math.max(view.z[0], 0))])[2];
        // its mesh lines rise with it
        for (const l of lines) if (l.key.startsWith(`${key}-mesh-`)) l.baseZ = m.baseZ;
        const ax = view.x[0] + 0.78 * (view.x[1] - view.x[0]);
        const ay = view.y[0] + 0.78 * (view.y[1] - view.y[0]);
        const az = f(ax, ay);
        if (Number.isFinite(az) && (!region || region(ax, ay))) labelAt(el, i, toBox([ax, ay, Math.min(view.z[1], Math.max(view.z[0], az))]), anim);
        else labelAt(el, i, [m.positions[0]!, m.positions[1]!, m.positions[2]!], anim);
        break;
      }
      case 'paramSurface': {
        const fx = fnOf(at(i, 'x'), ['u', 'v'])!, fy = fnOf(at(i, 'y'), ['u', 'v'])!, fz = fnOf(at(i, 'z'), ['u', 'v'])!;
        const u: [number, number] = [num(el.u[0], at(i, 'u[0]')), num(el.u[1], at(i, 'u[1]'))];
        const v: [number, number] = [num(el.v[0], at(i, 'v[0]')), num(el.v[1], at(i, 'v[1]'))];
        if (!(u[0] < u[1]) || !(v[0] < v[1])) {
          err(at(i), 'u and v ranges must be [min, max] with min < max');
          break;
        }
        const r = (a: number, b: number): M3 => [fx(a, b), fy(a, b), fz(a, b)];
        const e = 1e-5 * Math.max(1, u[1] - u[0], v[1] - v[0]);
        const ok = gridMesh(key, role, opacity, el.mesh ?? DEFAULT_MESH, r, (a, b) => {
          const ru = r(a + e, b).map((q, k) => (q - r(a - e, b)[k]!) / (2 * e)) as M3;
          const rv = r(a, b + e).map((q, k) => (q - r(a, b - e)[k]!) / (2 * e)) as M3;
          return boxNormal(ru, rv);
        }, u, v, undefined, anim);
        if (!ok) err(at(i), 'the surface is not defined for these u, v');
        else labelAt(el, i, toBox(r((u[0] + u[1]) / 2, v[0] + 0.25 * (v[1] - v[0]))), anim);
        break;
      }
      case 'plane': {
        let n: M3, d: number;
        if (el.equation) {
          let groups;
          try {
            groups = parseComparisons(el.equation, scope(['x', 'y', 'z']), 'x + y + z = 1');
          } catch (e) {
            err(at(i, 'equation'), exprMessage(e));
            break;
          }
          const c = groups.length === 1 && groups[0]!.length === 1 ? groups[0]![0]! : null;
          if (!c || c.op !== '=') {
            err(at(i, 'equation'), 'write the plane as one equation, e.g. "x + y + z = 1"');
            break;
          }
          const g = compile(c.diff, undefined, pointTable, { vars: ['x', 'y', 'z'], functions2: table2 });
          const coef = (['x', 'y', 'z'] as const).map((w) => compile(derive(c.diff, w), undefined, pointTable, { vars: ['x', 'y', 'z'], functions2: table2 }));
          n = coef.map((f) => f(0.3, -0.7, 1.1)) as M3;
          const n2 = coef.map((f) => f(-1.9, 2.3, -0.4)) as M3;
          if (n.some((q, k) => !Number.isFinite(q) || Math.abs(q - n2[k]!) > 1e-9) || n.every((q) => q === 0)) {
            err(at(i, 'equation'), `"${el.equation}" is not the equation of a plane (it must be linear in x, y, z)`);
            break;
          }
          d = -g(0, 0, 0);
        } else {
          const p = vec(el.point!, at(i, 'point'));
          n = [num(el.normal![0], at(i, 'normal[0]')), num(el.normal![1], at(i, 'normal[1]')), num(el.normal![2], at(i, 'normal[2]'))];
          if (n.every((q) => q === 0)) {
            err(at(i, 'normal'), 'the normal vector is zero');
            break;
          }
          d = n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
        }
        const poly = planePolygon(n, d);
        if (!poly) {
          err(at(i), 'the plane misses the view box');
          break;
        }
        polygonMesh(key, role, el.opacity ?? 0.55, poly, n, anim);
        const c = [0, 1, 2].map((k) => poly.reduce((s, p) => s + p[k]!, 0) / poly.length) as M3;
        labelAt(el, i, toBox(c), anim);
        break;
      }
      case 'tangentPlane': {
        const a = num(el.at[0], at(i, 'at[0]'));
        const b = num(el.at[1], at(i, 'at[1]'));
        const z0 = table2(el.to, '')!(a, b);
        const fx = table2(el.to, 'x')!(a, b);
        const fy = table2(el.to, 'y')!(a, b);
        if (![z0, fx, fy].every(Number.isFinite)) {
          err(at(i, 'at'), `"${el.to}" has no tangent plane at (${a}, ${b})${Number.isFinite(z0) ? ' (a partial derivative is undefined there)' : ''}`);
          break;
        }
        const n: M3 = [-fx, -fy, 1];
        let poly: M3[] | null;
        if (el.size !== undefined) {
          const s = el.size / 2;
          poly = [[a - s, b - s], [a + s, b - s], [a + s, b + s], [a - s, b + s]].map(([x, y]) => [x!, y!, z0 + fx * (x! - a) + fy * (y! - b)] as M3);
        } else poly = planePolygon(n, n[0] * a + n[1] * b + z0);
        if (!poly) {
          err(at(i), 'the tangent plane misses the view box');
          break;
        }
        polygonMesh(key, role, el.opacity ?? 0.6, poly, n, anim);
        labelAt(el, i, toBox(poly[2]!), anim);
        break;
      }
      case 'curve': {
        const fx = fnOf(at(i, 'x'), ['t'])!, fy = fnOf(at(i, 'y'), ['t'])!, fz = fnOf(at(i, 'z'), ['t'])!;
        const t0 = num(el.t[0], at(i, 't[0]'));
        const t1 = num(el.t[1], at(i, 't[1]'));
        if (!(t0 < t1)) {
          err(at(i, 't'), 't range must be [min, max] with min < max');
          break;
        }
        let cur: V3[] = [];
        let q = 0;
        const runs: V3[][] = [];
        for (let k = 0; k <= CURVE_SAMPLES; k++) {
          const t = t0 + ((t1 - t0) * k) / CURVE_SAMPLES;
          const p: M3 = [fx(t), fy(t), fz(t)];
          if (p.every(Number.isFinite)) cur.push(toBox(p));
          else if (cur.length) {
            runs.push(cur);
            cur = [];
          }
        }
        if (cur.length) runs.push(cur);
        const usable = runs.filter((r) => r.length > 1);
        if (!usable.length) {
          err(at(i), 'the curve is not defined for this t range');
          break;
        }
        for (const r of usable) lines.push({ key: `${key}-${q++}`, role, points: r, width: 2.5, ...(anim ? { anim } : {}) });
        const last = usable[usable.length - 1]!;
        labelAt(el, i, el.label?.at === 'start' ? usable[0]![0]! : last[last.length - 1]!, anim);
        break;
      }
      case 'point': {
        let p: M3;
        if (el.at !== undefined) p = vec(el.at, at(i, 'at'));
        else {
          const x = num(el.over![0], at(i, 'over[0]'));
          const y = num(el.over![1], at(i, 'over[1]'));
          p = [x, y, table2(el.on!, '')!(x, y)];
        }
        if (!p.every(Number.isFinite)) {
          err(at(i), 'the point is not defined');
          break;
        }
        if (!inView(p)) err(at(i), `point ${fmt(p)} is outside the view`);
        if (el.id) points.set(el.id, p);
        dots.push({ key, role, at: toBox(p), ...(anim ? { anim } : {}) });
        labelAt(el, i, toBox(p), anim);
        break;
      }
      case 'vector':
      case 'segment': {
        const from = vec(el.from, at(i, 'from'));
        let to: M3;
        if (el.type === 'vector' && el.components) {
          const c = el.components.map((q, k) => num(q, at(i, `components[${k}]`)));
          to = [from[0] + c[0]!, from[1] + c[1]!, from[2] + c[2]!];
        } else to = vec(el.to!, at(i, 'to'));
        if (![...from, ...to].every(Number.isFinite)) break;
        if (from.every((q, k) => q === to[k])) {
          err(at(i), `the ${el.type} has zero length`);
          break;
        }
        if (el.type === 'vector') arrows.push({ key, role, from: toBox(from), to: toBox(to), ...(anim ? { anim } : {}) });
        else lines.push({ key, role, points: [toBox(from), toBox(to)], width: 1.5, ...(anim ? { anim } : {}) });
        labelAt(el, i, toBox(el.type === 'vector' ? to : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]), anim);
        break;
      }
      case 'contour': {
        const f: Fxy | undefined = surfaceIds.includes(el.f.trim()) ? table2(el.f.trim(), '') : (fnOf(at(i, 'f'), ['x', 'y']) as Fxy | null) ?? undefined;
        if (!f) break;
        const grid = sampleGrid(f, view.x, view.y, 64);
        const finite = grid.v.flat().filter(Number.isFinite);
        const lo = Math.min(...finite), hi = Math.max(...finite);
        let levels: number[];
        if (Array.isArray(el.levels)) {
          levels = el.levels;
          const bad = levels.filter((c) => !(c >= lo && c <= hi));
          if (bad.length) err(at(i, 'levels'), `level ${bad.join(', ')} doesn't occur in the view (f goes from ${+lo.toPrecision(4)} to ${+hi.toPrecision(4)})`);
        } else levels = autoLevels(grid.v, el.levels ?? 6);
        const floor = view.z[0];
        let q = 0;
        for (const { lines: ls } of contourLines(f, view.x, view.y, levels, 64)) {
          for (const l of ls) lines.push({ key: `${key}-${q++}`, role, points: l.map(([x, y]) => toBox([x, y, floor])), width: 1.25, ...(anim ? { anim } : {}) });
        }
        break;
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  // --- box edges and floor grid
  const showBox = fig.axes?.box ?? true;
  // About four ticks per axis: 3D boxes are small, so coarser than 2D.
  const tick = (r: [number, number]) => {
    const raw = (r[1] - r[0]) / 4;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p10;
    return ticks(r[0], r[1], (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p10);
  };
  // x and y end ticks meet at the box corners and would overlap; keep the inner ones.
  const inner = (r: [number, number]) => tick(r).filter((v) => v !== r[0] && v !== r[1]);
  const tx = inner(view.x), ty = inner(view.y), tz = tick(view.z);
  if (showBox) {
    const [x0, x1] = view.x, [y0, y1] = view.y, [z0, z1] = view.z;
    const c = (x: number, y: number, z: number) => toBox([x, y, z]);
    const edges: [V3, V3][] = [
      [c(x0, y0, z0), c(x1, y0, z0)], [c(x1, y0, z0), c(x1, y1, z0)], [c(x1, y1, z0), c(x0, y1, z0)], [c(x0, y1, z0), c(x0, y0, z0)],
      [c(x0, y0, z1), c(x1, y0, z1)], [c(x1, y0, z1), c(x1, y1, z1)], [c(x1, y1, z1), c(x0, y1, z1)], [c(x0, y1, z1), c(x0, y0, z1)],
      [c(x0, y0, z0), c(x0, y0, z1)], [c(x1, y0, z0), c(x1, y0, z1)], [c(x1, y1, z0), c(x1, y1, z1)], [c(x0, y1, z0), c(x0, y1, z1)],
    ];
    edges.forEach(([a, b], k) => lines.unshift({ key: `box-${k}`, role: 'axis', points: [a, b], width: 1 }));
    tx.forEach((v, k) => lines.unshift({ key: `floor-x-${k}`, role: 'grid', points: [c(v, y0, z0), c(v, y1, z0)], width: 1 }));
    ty.forEach((v, k) => lines.unshift({ key: `floor-y-${k}`, role: 'grid', points: [c(x0, v, z0), c(x1, v, z0)], width: 1 }));
  }

  const theme = opts.theme ?? ByeLightTheme;
  const width = opts.width;
  const height = opts.height ?? width / (fig.aspect ?? 1);
  return {
    ok: true,
    scene: {
      kind: 'scene3d',
      width,
      height,
      describe: fig.describe,
      theme,
      camera: { azimuth: fig.camera?.azimuth ?? -55, elevation: fig.camera?.elevation ?? 25, zoom: fig.camera?.zoom ?? 1 },
      rotate: fig.rotate,
      view: { x: [view.x[0], view.x[1]], y: [view.y[0], view.y[1]], z: [view.z[0], view.z[1]] },
      toBox,
      meshes,
      lines,
      arrows,
      dots,
      labels,
      ticks: { x: tx, y: ty, z: tz },
      showBox,
      tickLabels: fig.axes?.labels ?? true,
    },
  };
}
