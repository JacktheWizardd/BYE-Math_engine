import { autoLevels, sampleGrid, type Fxy } from './contour.ts';
import {
  compile,
  derive,
  ExprError,
  isReservedName,
  NoSymbolicDerivative,
  numericDerivative,
  parseExpr,
  referencedIds,
  type Fn1,
  type Node,
} from '../expr/index.ts';
import type {
  AnimationKind,
  Coord,
  Element,
  Plot2dFigure,
  FigureIssue,
  FunctionEl,
  ContourEl,
  VectorEl,
  IntersectionEl,
  LineEl,
  MathLabelEl,
  PointEl,
  PointRef,
  RegionEl,
  SegmentEl,
  TangentEl,
  TextEl,
} from '../spec/index.ts';
import { findRoots } from './solve.ts';
import type { Vec } from './view.ts';

export interface FnInfo {
  id: string;
  index: number;
  el: FunctionEl;
  /** Resolved expression for y (used for symbolic derivatives). */
  node: Node;
  fn: Fn1;
  /** x-range to draw: the function's domain intersected with the view. */
  range: [number, number];
  /** x values the sampler must hit exactly. */
  breakpoints: number[];
}

/** How an element animates when the figure appears (resolved from `animate`). */
export interface ItemAnim {
  kind: AnimationKind;
  delay: number;
  duration: number;
  /** For "move": the x the point starts from. */
  from?: number;
}

interface ItemBase {
  index: number;
  anim?: ItemAnim;
}

export type Item = ItemBase &
  (
    | { type: 'function'; el: FunctionEl; fn: FnInfo }
    | { type: 'region'; el: RegionEl; top: FnInfo; bottom: FnInfo | null; from: number; to: number }
    | { type: 'point'; el: PointEl | IntersectionEl; at: Vec; on: FnInfo | null }
    | { type: 'segment'; el: SegmentEl | TangentEl | VectorEl; from: Vec; to: Vec }
    | { type: 'line'; el: LineEl | TangentEl; p: Vec; q: Vec }
    | { type: 'text'; el: TextEl; at: Vec }
    | { type: 'mathLabel'; el: MathLabelEl; at: Vec }
    | { type: 'contour'; el: ContourEl; fn: Fxy; levels: number[]; mesh: number }
  );

export interface FigureModel {
  figure: Plot2dFigure;
  functions: Map<string, FnInfo>;
  /** Resolved coordinates of point-like elements (point, intersection) by id. */
  points: Map<string, Vec>;
  /** Items in element order (draw order). */
  items: Item[];
}

export type CompileResult = { ok: true; model: FigureModel } | { ok: false; errors: FigureIssue[] };

const exprMessage = (e: unknown): string => (e instanceof ExprError ? e.describe() : String((e as Error)?.message ?? e));

const POINT_LIKE = new Set(['point', 'intersection']);
const LINE_LIKE = new Set(['line', 'tangent']);
const DEFAULT_DURATION = 700;

/**
 * Resolves a structurally valid figure: compiles expressions, links references
 * (point on f, region under f, "f(1)", "P.x", segment from "P"), orders elements
 * by their dependencies, computes tangents and intersections, and checks values
 * against the view. Never throws; returns every problem found.
 */
export function compileFigure(figure: Plot2dFigure): CompileResult {
  const errors: FigureIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const at = (i: number, field?: string) => `elements[${i}]${field ? `.${field}` : ''}`;
  const { view } = figure;
  const els = figure.elements;

  // --- ids: unique, not reserved; what kind each one is
  const ids = new Map<string, number>();
  els.forEach((el, i) => {
    if (!el.id) return;
    if (isReservedName(el.id)) err(at(i, 'id'), `"${el.id}" is a reserved name (x, built-in functions, pi, e)`);
    if (ids.has(el.id)) err(at(i, 'id'), `Duplicate id "${el.id}" (also elements[${ids.get(el.id)}])`);
    ids.set(el.id, i);
  });
  const kindOf = (id: string) => {
    const i = ids.get(id);
    return i === undefined ? undefined : els[i]!.type;
  };
  const fnIds = [...ids.keys()].filter((id) => kindOf(id) === 'function');
  const pointIds = [...ids.keys()].filter((id) => POINT_LIKE.has(kindOf(id)!));
  // Contours with an id are two-variable functions: g(1, 2), g_x(1, 2) (e.g. for gradient vectors).
  const fn2Ids = [...ids.keys()].filter((id) => kindOf(id) === 'contour');
  const others = new Map([...ids.keys()].filter((id) => !fnIds.includes(id) && !pointIds.includes(id) && !fn2Ids.includes(id)).map((id) => [id, kindOf(id)!]));

  // --- parse every expression once, collecting dependencies per element
  const nodes = new Map<string, Node>(); // by path
  const deps: Set<string>[] = els.map(() => new Set<string>());
  const parseAt = (i: number, path: string, src: string, variables: string[]) => {
    try {
      const node = parseExpr(src, { variables, functions: fnIds, points: pointIds, functions2: fn2Ids, others });
      nodes.set(path, node);
      referencedIds(node).forEach((d) => deps[i]!.add(d));
    } catch (e) {
      err(path, exprMessage(e));
    }
  };
  const coordAt = (i: number, path: string, c: Coord | undefined) => {
    if (typeof c === 'string') parseAt(i, path, c, []);
  };
  const pointRefAt = (i: number, path: string, p: PointRef | undefined) => {
    if (p === undefined) return;
    if (typeof p === 'string') {
      requireKind(i, path, p, POINT_LIKE, 'point');
      return;
    }
    coordAt(i, `${path}[0]`, p[0]);
    coordAt(i, `${path}[1]`, p[1]);
  };
  const requireKind = (i: number, path: string, id: string, kinds: Set<string>, what: string) => {
    const k = kindOf(id);
    if (k === undefined) err(path, `No element with id "${id}"`);
    else if (!kinds.has(k)) err(path, `"${id}" is a ${k}, not a ${what}`);
    else deps[i]!.add(id);
  };
  const FN = new Set(['function']);
  const CURVE = new Set(['function', 'line', 'tangent']);

  els.forEach((el, i) => {
    switch (el.type) {
      case 'function':
        parseAt(i, at(i, 'y'), el.y, ['x']);
        coordAt(i, at(i, 'domain[0]'), el.domain?.[0]);
        coordAt(i, at(i, 'domain[1]'), el.domain?.[1]);
        break;
      case 'region':
        if (el.under) requireKind(i, at(i, 'under'), el.under, FN, 'function');
        if (el.between) el.between.forEach((id, k) => requireKind(i, at(i, `between[${k}]`), id, FN, 'function'));
        coordAt(i, at(i, 'from'), el.from);
        coordAt(i, at(i, 'to'), el.to);
        break;
      case 'point':
        pointRefAt(i, at(i, 'at'), el.at);
        if (el.on) requireKind(i, at(i, 'on'), el.on, FN, 'function');
        coordAt(i, at(i, 'x'), el.x);
        break;
      case 'segment':
        pointRefAt(i, at(i, 'from'), el.from);
        pointRefAt(i, at(i, 'to'), el.to);
        break;
      case 'vector':
        pointRefAt(i, at(i, 'from'), el.from);
        pointRefAt(i, at(i, 'to'), el.to);
        coordAt(i, at(i, 'components[0]'), el.components?.[0]);
        coordAt(i, at(i, 'components[1]'), el.components?.[1]);
        break;
      case 'line':
        el.through?.forEach((p, k) => pointRefAt(i, at(i, `through[${k}]`), p));
        pointRefAt(i, at(i, 'point'), el.point);
        coordAt(i, at(i, 'slope'), el.slope);
        break;
      case 'text':
      case 'mathLabel':
        pointRefAt(i, at(i, 'at'), el.at);
        break;
      case 'tangent':
        requireKind(i, at(i, 'to'), el.to, FN, 'function');
        coordAt(i, at(i, 'at'), el.at);
        break;
      case 'intersection':
        el.of.forEach((id, k) => requireKind(i, at(i, `of[${k}]`), id, CURVE, 'function or line'));
        coordAt(i, at(i, 'near'), el.near);
        break;
      case 'contour':
        parseAt(i, at(i, 'f'), el.f, ['x', 'y']);
        break;
    }
    if (el.animate && typeof el.animate === 'object') coordAt(i, at(i, 'animate.from'), el.animate.from);
  });
  if (errors.length) return { ok: false, errors };

  // --- order by dependencies (an element may refer to one defined later); report cycles
  const order: number[] = [];
  const state: ('new' | 'visiting' | 'done')[] = els.map(() => 'new');
  const name = (i: number) => els[i]!.id ?? `elements[${i}]`;
  const visit = (i: number, trail: number[]): boolean => {
    if (state[i] === 'done') return true;
    if (state[i] === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(i)), i].map(name).join(' → ');
      err(at(i), `Circular definition: ${cycle}`);
      return false;
    }
    state[i] = 'visiting';
    for (const d of deps[i]!) {
      const j = ids.get(d);
      if (j !== undefined && !visit(j, [...trail, i])) return false;
    }
    state[i] = 'done';
    order.push(i);
    return true;
  };
  for (let i = 0; i < els.length; i++) if (!visit(i, [])) return { ok: false, errors };

  // --- evaluate in dependency order
  const functions = new Map<string, FnInfo>();
  const points = new Map<string, Vec>();
  const lines = new Map<string, { p: Vec; q: Vec }>();
  const derivCache = new Map<string, { node: Node | null; fn: Fn1 }>();

  const table = (id: string, k: number): Fn1 | undefined => {
    const f = functions.get(id);
    if (!f) return undefined;
    return k === 0 ? f.fn : derivative(f, k);
  };
  const pointTable = (id: string) => points.get(id);
  const fn2Cache = new Map<string, Fxy>();
  const table2 = (id: string, partial: string): Fxy | undefined => {
    const key = `${id}:${partial}`;
    const hit = fn2Cache.get(key);
    if (hit) return hit;
    const i = ids.get(id);
    let node = i === undefined ? undefined : nodes.get(at(i, 'f'));
    if (!node) return undefined;
    let f: Fxy;
    try {
      for (const c of partial) node = derive(node, c);
      f = compile(node, table, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy;
    } catch (e) {
      if (!(e instanceof NoSymbolicDerivative)) throw e;
      // numeric fallback for the last partial
      const prev = table2(id, partial.slice(0, -1))!;
      const h = 1e-5;
      f = partial.endsWith('x') ? (x, y) => (prev(x + h, y) - prev(x - h, y)) / (2 * h) : (x, y) => (prev(x, y + h) - prev(x, y - h)) / (2 * h);
    }
    fn2Cache.set(key, f);
    return f;
  };
  const copts = { functions2: table2 };

  /** k-th derivative of a function element: symbolic where possible, numeric otherwise. */
  function derivative(f: FnInfo, k: number): Fn1 {
    const key = `${f.id}:${k}`;
    const hit = derivCache.get(key);
    if (hit) return hit.fn;
    const prevNode = k === 1 ? f.node : (derivCache.get(`${f.id}:${k - 1}`)?.node ?? (derivative(f, k - 1), derivCache.get(`${f.id}:${k - 1}`)!.node));
    let entry: { node: Node | null; fn: Fn1 };
    try {
      if (!prevNode) throw new NoSymbolicDerivative(`${f.id}${"'".repeat(k - 1)}`);
      const node = derive(prevNode);
      entry = { node, fn: compile(node, table, pointTable, copts) };
    } catch (e) {
      if (!(e instanceof NoSymbolicDerivative)) throw e;
      const prev = k === 1 ? f.fn : derivative(f, k - 1);
      entry = { node: null, fn: (x) => numericDerivative(prev, x) };
    }
    derivCache.set(key, entry);
    return entry.fn;
  }

  const num = (c: Coord, path: string): number => {
    if (typeof c === 'number') {
      if (!Number.isFinite(c)) err(path, 'must be a finite number');
      return c;
    }
    const node = nodes.get(path);
    if (!node) return NaN;
    const v = compile(node, table, pointTable, copts)(NaN);
    if (!Number.isFinite(v)) err(path, `"${c}" is not a finite number (got ${v})`);
    return v;
  };
  const vec = (p: PointRef, path: string): Vec => {
    if (typeof p === 'string') return points.get(p) ?? [NaN, NaN];
    return [num(p[0], `${path}[0]`), num(p[1], `${path}[1]`)];
  };
  const inView = (p: Vec) => p[0] >= view.x[0] && p[0] <= view.x[1] && p[1] >= view.y[0] && p[1] <= view.y[1];
  const fmt = (p: Vec) => `(${+p[0].toFixed(4)}, ${+p[1].toFixed(4)})`;
  const addBreak = (f: FnInfo | null | undefined, x: number) => {
    if (f && Number.isFinite(x)) f.breakpoints.push(x);
  };
  const fnOf = (id: string | undefined) => (id ? functions.get(id) : undefined);

  const items: Item[] = [];

  /** Resolve `animate` with defaults by element type; check kind fits the element. */
  const animOf = (el: Element, i: number, onFn: FnInfo | null): ItemAnim | undefined => {
    const a = el.animate;
    if (!a) return undefined;
    const o = typeof a === 'object' ? a : {};
    const natural: AnimationKind =
      el.type === 'region' ? 'fill' : el.type === 'point' && el.on ? 'move' : ['function', 'line', 'tangent', 'segment', 'contour', 'vector'].includes(el.type) ? 'draw' : 'fade';
    const kind = o.kind ?? natural;
    const allowed: Record<AnimationKind, boolean> = {
      draw: ['function', 'line', 'tangent', 'segment', 'contour', 'vector'].includes(el.type),
      fill: el.type === 'region',
      move: el.type === 'point' && !!el.on,
      fade: true,
      grow: false,
    };
    if (!allowed[kind]) {
      err(at(i, 'animate.kind'), `"${kind}" doesn't apply to a ${el.type}${kind === 'move' ? ' (only a point with "on" can move)' : ''}`);
      return undefined;
    }
    const anim: ItemAnim = { kind, delay: o.delay ?? 0, duration: o.duration ?? DEFAULT_DURATION };
    if (kind === 'move' && onFn) {
      const from = o.from !== undefined ? num(o.from, at(i, 'animate.from')) : onFn.range[0];
      if (from < onFn.range[0] || from > onFn.range[1]) err(at(i, 'animate.from'), `start x ${from} is outside the range of "${onFn.id}"`);
      anim.from = from;
      addBreak(onFn, from);
    }
    return anim;
  };

  /** A curve or line as y(x), for intersections. Vertical lines give { vertical: x }. */
  const asCurve = (id: string): { fn: Fn1; range: [number, number]; vertical?: undefined } | { vertical: number } | null => {
    const f = functions.get(id);
    if (f) return { fn: f.fn, range: f.range };
    const l = lines.get(id);
    if (!l) return null;
    const [p, q] = [l.p, l.q];
    if (p[0] === q[0]) return { vertical: p[0] };
    const m = (q[1] - p[1]) / (q[0] - p[0]);
    return { fn: (x) => p[1] + m * (x - p[0]), range: [view.x[0], view.x[1]] };
  };

  for (const i of order) {
    const el = els[i]!;
    switch (el.type) {
      case 'function': {
        const node = nodes.get(at(i, 'y'));
        if (!node) break;
        const info: FnInfo = {
          id: el.id ?? `#${i}`,
          index: i,
          el,
          node,
          fn: compile(node, table, pointTable, copts),
          range: [view.x[0], view.x[1]],
          breakpoints: [],
        };
        if (el.domain) {
          const a = num(el.domain[0], at(i, 'domain[0]'));
          const b = num(el.domain[1], at(i, 'domain[1]'));
          if (!(a < b)) err(at(i, 'domain'), 'domain must be [min, max] with min < max');
          info.range = [Math.max(a, view.x[0]), Math.min(b, view.x[1])];
          if (!(info.range[0] < info.range[1])) err(at(i, 'domain'), 'domain lies outside the view');
        }
        if (el.id) functions.set(el.id, info);
        if (typeof el.label?.at === 'number') addBreak(info, el.label.at);
        items.push({ type: 'function', index: i, el, fn: info, anim: animOf(el, i, null) });
        break;
      }
      case 'region': {
        const top = fnOf(el.under ?? el.between?.[0]);
        const bottom = el.between ? fnOf(el.between[1]) : null;
        const from = num(el.from, at(i, 'from'));
        const to = num(el.to, at(i, 'to'));
        if (!(from < to)) err(at(i), `region "from" (${from}) must be less than "to" (${to})`);
        if (from < view.x[0] || to > view.x[1]) {
          err(at(i), `region bounds [${from}, ${to}] are outside the view x-range [${view.x[0]}, ${view.x[1]}]`);
        }
        for (const f of [top, bottom]) {
          if (f && (from < f.range[0] || to > f.range[1])) err(at(i), `region bounds are outside the domain of "${f.id}"`);
        }
        [top, bottom].forEach((f) => {
          addBreak(f, from);
          addBreak(f, to);
        });
        if (top && (bottom || !el.between)) items.push({ type: 'region', index: i, el, top, bottom: bottom ?? null, from, to, anim: animOf(el, i, null) });
        break;
      }
      case 'point': {
        if (el.at !== undefined) {
          const p = vec(el.at, at(i, 'at'));
          if (!inView(p)) err(at(i, 'at'), `point ${fmt(p)} is outside the view`);
          if (el.id) points.set(el.id, p);
          items.push({ type: 'point', index: i, el, at: p, on: null, anim: animOf(el, i, null) });
        } else {
          const f = fnOf(el.on);
          const x = num(el.x!, at(i, 'x'));
          if (!f) break;
          const y = f.fn(x);
          if (!Number.isFinite(y)) err(at(i, 'x'), `${f.id}(${x}) is not defined`);
          else if (!inView([x, y])) err(at(i), `point ${fmt([x, y])} on ${f.id} is outside the view`);
          addBreak(f, x);
          if (el.id) points.set(el.id, [x, y]);
          items.push({ type: 'point', index: i, el, at: [x, y], on: f, anim: animOf(el, i, f) });
        }
        break;
      }
      case 'intersection': {
        const [aId, bId] = el.of;
        const a = asCurve(aId);
        const b = bId ? asCurve(bId) : { fn: () => 0, range: [view.x[0], view.x[1]] as [number, number] };
        if (!a || !b) break;
        const what = bId ? `"${aId}" and "${bId}"` : `"${aId}" and the x-axis`;
        let hits: Vec[] = [];
        if (a.vertical !== undefined && b.vertical !== undefined) {
          err(at(i, 'of'), `${what} are both vertical lines`);
          break;
        } else if (a.vertical !== undefined || b.vertical !== undefined) {
          const xv = (a.vertical ?? b.vertical)!;
          const other = (a.vertical === undefined ? a : b) as { fn: Fn1; range: [number, number] };
          if (xv >= other.range[0] && xv <= other.range[1]) hits = [[xv, other.fn(xv)]];
        } else {
          const lo = Math.max(a.range[0], b.range[0]);
          const hi = Math.min(a.range[1], b.range[1]);
          if (lo < hi) hits = findRoots((x) => a.fn(x) - b.fn(x), lo, hi).map((x) => [x, a.fn(x)] as Vec);
        }
        hits = hits.filter((p) => Number.isFinite(p[1]) && inView(p));
        if (!hits.length) {
          err(at(i), `${what} don't meet inside the view`);
          break;
        }
        let pick: Vec;
        if (el.near !== undefined) {
          const n = num(el.near, at(i, 'near'));
          pick = hits.reduce((best, p) => (Math.abs(p[0] - n) < Math.abs(best[0] - n) ? p : best));
        } else {
          const k = el.index ?? 0;
          if (k >= hits.length) {
            err(at(i, 'index'), `${what} meet ${hits.length} time${hits.length === 1 ? '' : 's'} in the view; index ${k} doesn't exist`);
            break;
          }
          pick = hits[k]!;
        }
        // Snap values that are zero up to rounding (roots found by bisection).
        pick = [Math.abs(pick[0]) < 1e-12 ? 0 : pick[0], Math.abs(pick[1]) < 1e-12 ? 0 : pick[1]];
        if (el.id) points.set(el.id, pick);
        for (const id of el.of) addBreak(functions.get(id), pick[0]);
        items.push({ type: 'point', index: i, el, at: pick, on: null, anim: animOf(el, i, null) });
        break;
      }
      case 'segment':
        items.push({ type: 'segment', index: i, el, from: vec(el.from, at(i, 'from')), to: vec(el.to, at(i, 'to')), anim: animOf(el, i, null) });
        break;
      case 'vector': {
        const from = vec(el.from, at(i, 'from'));
        const to: Vec = el.to !== undefined ? vec(el.to, at(i, 'to')) : [from[0] + num(el.components![0], at(i, 'components[0]')), from[1] + num(el.components![1], at(i, 'components[1]'))];
        if (from[0] === to[0] && from[1] === to[1]) err(at(i), 'the vector has zero length');
        items.push({ type: 'segment', index: i, el, from, to, anim: animOf(el, i, null) });
        break;
      }
      case 'line': {
        let p: Vec, q: Vec;
        if (el.through) {
          p = vec(el.through[0], at(i, 'through[0]'));
          q = vec(el.through[1], at(i, 'through[1]'));
          if (p[0] === q[0] && p[1] === q[1]) err(at(i, 'through'), 'the two points are the same');
        } else {
          p = vec(el.point!, at(i, 'point'));
          const m = num(el.slope!, at(i, 'slope'));
          q = [p[0] + 1, p[1] + m];
        }
        if (el.id) lines.set(el.id, { p, q });
        items.push({ type: 'line', index: i, el, p, q, anim: animOf(el, i, null) });
        break;
      }
      case 'tangent': {
        const f = fnOf(el.to);
        if (!f) break;
        const a = num(el.at, at(i, 'at'));
        if (!(a >= f.range[0] && a <= f.range[1])) {
          err(at(i, 'at'), `x = ${a} is outside the range of "${f.id}"`);
          break;
        }
        const y = f.fn(a);
        let m = derivative(f, 1)(a);
        if (!Number.isFinite(m)) m = numericDerivative(f.fn, a);
        if (!Number.isFinite(y) || !Number.isFinite(m) || Math.abs(m) > 1e8) {
          err(at(i, 'at'), `"${f.id}" has no tangent at x = ${a}${Number.isFinite(y) ? ' (the slope is infinite or undefined)' : ''}`);
          break;
        }
        addBreak(f, a);
        const p: Vec = [a, y];
        const q: Vec = [a + 1, y + m];
        if (el.id) lines.set(el.id, { p, q });
        const anim = animOf(el, i, null);
        if (el.length !== undefined) {
          const dx = el.length / 2 / Math.sqrt(1 + m * m);
          items.push({ type: 'segment', index: i, el, from: [a - dx, y - m * dx], to: [a + dx, y + m * dx], anim });
        } else {
          items.push({ type: 'line', index: i, el, p, q, anim });
        }
        break;
      }
      case 'text': {
        const p = vec(el.at, at(i, 'at'));
        if (!inView(p)) err(at(i, 'at'), `text position ${fmt(p)} is outside the view`);
        items.push({ type: 'text', index: i, el, at: p, anim: animOf(el, i, null) });
        break;
      }
      case 'mathLabel': {
        const p = vec(el.at, at(i, 'at'));
        if (!inView(p)) err(at(i, 'at'), `label position ${fmt(p)} is outside the view`);
        items.push({ type: 'mathLabel', index: i, el, at: p, anim: animOf(el, i, null) });
        break;
      }
      case 'contour': {
        const node = nodes.get(at(i, 'f'));
        if (!node) break;
        const f = (el.id ? table2(el.id, '') : undefined) ?? (compile(node, table, pointTable, { vars: ['x', 'y'], functions2: table2 }) as Fxy);
        const mesh = el.mesh ?? 64;
        const grid = sampleGrid(f, view.x, view.y, mesh);
        const finite = grid.v.flat().filter(Number.isFinite);
        if (!finite.length) {
          err(at(i, 'f'), `"${el.f}" is not defined anywhere in the view`);
          break;
        }
        const lo = Math.min(...finite);
        const hi = Math.max(...finite);
        let levels: number[];
        if (Array.isArray(el.levels)) {
          levels = el.levels;
          const bad = levels.filter((c) => c < lo || c > hi);
          if (bad.length) err(at(i, 'levels'), `level ${bad.join(', ')} doesn't occur in the view (f goes from ${+lo.toPrecision(4)} to ${+hi.toPrecision(4)})`);
        } else levels = autoLevels(grid.v, el.levels ?? 6);
        items.push({ type: 'contour', index: i, el, fn: f, levels, mesh, anim: animOf(el, i, null) });
        break;
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  items.sort((p, q) => p.index - q.index);
  return { ok: true, model: { figure, functions, points, items } };
}
