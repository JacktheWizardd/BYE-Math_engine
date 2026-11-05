import { compileExpr, ExprError, isReservedName, parseExpr, referencedFunctions, type Fn1 } from '../expr/index.ts';
import type { Coord, Element, Figure, FigureIssue, FunctionEl, LineEl, MathLabelEl, PointEl, RegionEl, SegmentEl, TextEl } from '../spec/index.ts';
import type { Vec } from './view.ts';

export interface FnInfo {
  id: string;
  index: number;
  el: FunctionEl;
  fn: Fn1;
  /** x-range to draw: the function's domain intersected with the view. */
  range: [number, number];
  /** x values the sampler must hit exactly. */
  breakpoints: number[];
}

export type Item =
  | { type: 'function'; index: number; el: FunctionEl; fn: FnInfo }
  | { type: 'region'; index: number; el: RegionEl; top: FnInfo; bottom: FnInfo | null; from: number; to: number }
  | { type: 'point'; index: number; el: PointEl; at: Vec; on: FnInfo | null }
  | { type: 'segment'; index: number; el: SegmentEl; from: Vec; to: Vec }
  | { type: 'line'; index: number; el: LineEl; p: Vec; q: Vec }
  | { type: 'text'; index: number; el: TextEl; at: Vec }
  | { type: 'mathLabel'; index: number; el: MathLabelEl; at: Vec };

export interface FigureModel {
  figure: Figure;
  functions: Map<string, FnInfo>;
  items: Item[];
}

export type CompileResult = { ok: true; model: FigureModel } | { ok: false; errors: FigureIssue[] };

const exprMessage = (e: unknown): string => (e instanceof ExprError ? e.describe() : String((e as Error)?.message ?? e));

/**
 * Resolves a structurally valid figure: compiles expressions, links references
 * (point on f, region under f, "f(1)" in coordinates), checks for cycles and
 * values that fall outside the view. Never throws; returns every problem found.
 */
export function compileFigure(figure: Figure): CompileResult {
  const errors: FigureIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const at = (i: number, field?: string) => `elements[${i}]${field ? `.${field}` : ''}`;
  const { view } = figure;

  // Ids: unique, not reserved.
  const ids = new Map<string, number>();
  figure.elements.forEach((el, i) => {
    if (!el.id) return;
    if (isReservedName(el.id)) err(at(i, 'id'), `"${el.id}" is a reserved name (x, built-in functions, pi, e)`);
    if (ids.has(el.id)) err(at(i, 'id'), `Duplicate id "${el.id}" (also elements[${ids.get(el.id)}])`);
    ids.set(el.id, i);
  });

  const fnEls = figure.elements.flatMap((el, i) => (el.type === 'function' && el.id ? [{ el, i }] : []));
  const fnIds = fnEls.map((f) => f.el.id!);
  const functions = new Map<string, FnInfo>();
  const table = (id: string) => functions.get(id)?.fn;

  // Compile function bodies, collecting the dependency graph.
  const deps = new Map<string, Set<string>>();
  const anonymous: FnInfo[] = [];
  figure.elements.forEach((el, i) => {
    if (el.type !== 'function') return;
    try {
      const node = parseExpr(el.y, { variables: ['x'], functions: fnIds });
      const fn = compileExpr(el.y, { variables: ['x'], functions: fnIds }, table);
      const info: FnInfo = { id: el.id ?? `#${i}`, index: i, el, fn, range: [view.x[0], view.x[1]], breakpoints: [] };
      if (el.id) {
        functions.set(el.id, info);
        deps.set(el.id, referencedFunctions(node));
      } else anonymous.push(info);
    } catch (e) {
      err(at(i, 'y'), exprMessage(e));
    }
  });

  // Cycles (f defined from g defined from f) would recurse forever.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): boolean => {
    if (state.get(id) === 'done') return true;
    if (state.get(id) === 'visiting') {
      err(at(ids.get(id)!, 'y'), `Circular definition: ${[...trail, id].join(' → ')}`);
      return false;
    }
    state.set(id, 'visiting');
    for (const d of deps.get(id) ?? []) if (!visit(d, [...trail, id])) return false;
    state.set(id, 'done');
    return true;
  };
  for (const id of deps.keys()) visit(id, []);
  if (errors.length) return { ok: false, errors };

  /** Evaluates a constant coordinate (number or expression like "f(1)"). */
  const num = (c: Coord, path: string): number => {
    if (typeof c === 'number') {
      if (!Number.isFinite(c)) err(path, 'must be a finite number');
      return c;
    }
    try {
      const v = compileExpr(c, { variables: [], functions: fnIds }, table)(NaN);
      if (!Number.isFinite(v)) err(path, `"${c}" is not a finite number (got ${v})`);
      return v;
    } catch (e) {
      err(path, exprMessage(e));
      return NaN;
    }
  };
  const vec = (p: readonly [Coord, Coord], path: string): Vec => [num(p[0], `${path}[0]`), num(p[1], `${path}[1]`)];
  const fnRef = (id: string, path: string): FnInfo | null => {
    const f = functions.get(id);
    if (!f) {
      const i = ids.get(id);
      err(path, i === undefined ? `No element with id "${id}"` : `"${id}" is a ${figure.elements[i]!.type}, not a function`);
      return null;
    }
    return f;
  };
  const inView = (p: Vec) => p[0] >= view.x[0] && p[0] <= view.x[1] && p[1] >= view.y[0] && p[1] <= view.y[1];
  const fmt = (p: Vec) => `(${+p[0].toFixed(4)}, ${+p[1].toFixed(4)})`;

  // Function domains.
  for (const f of [...functions.values(), ...anonymous]) {
    if (f.el.domain) {
      const a = num(f.el.domain[0], at(f.index, 'domain[0]'));
      const b = num(f.el.domain[1], at(f.index, 'domain[1]'));
      if (!(a < b)) err(at(f.index, 'domain'), 'domain must be [min, max] with min < max');
      f.range = [Math.max(a, view.x[0]), Math.min(b, view.x[1])];
      if (!(f.range[0] < f.range[1])) err(at(f.index, 'domain'), 'domain lies outside the view');
    }
  }

  const items: Item[] = [];
  const addBreak = (f: FnInfo | null, x: number) => {
    if (f && Number.isFinite(x)) f.breakpoints.push(x);
  };

  figure.elements.forEach((el: Element, i) => {
    switch (el.type) {
      case 'function': {
        const fn = el.id ? functions.get(el.id) : anonymous.find((a) => a.index === i);
        if (!fn) return;
        if (typeof el.label?.at === 'number') addBreak(fn, el.label.at);
        items.push({ type: 'function', index: i, el, fn });
        return;
      }
      case 'region': {
        const top = fnRef(el.under ?? el.between![0], at(i, el.under ? 'under' : 'between[0]'));
        const bottom = el.between ? fnRef(el.between[1], at(i, 'between[1]')) : null;
        const from = num(el.from, at(i, 'from'));
        const to = num(el.to, at(i, 'to'));
        if (!(from < to)) err(at(i), `region "from" (${from}) must be less than "to" (${to})`);
        if (from < view.x[0] || to > view.x[1]) {
          err(at(i), `region bounds [${from}, ${to}] are outside the view x-range [${view.x[0]}, ${view.x[1]}]`);
        }
        for (const f of [top, bottom]) {
          if (f && (from < f.range[0] || to > f.range[1])) err(at(i), `region bounds are outside the domain of "${f.id}"`);
        }
        addBreak(top, from);
        addBreak(top, to);
        addBreak(bottom, from);
        addBreak(bottom, to);
        if (top && (bottom || !el.between)) items.push({ type: 'region', index: i, el, top, bottom, from, to });
        return;
      }
      case 'point': {
        if (el.at) {
          const p = vec(el.at, at(i, 'at'));
          if (!inView(p)) err(at(i, 'at'), `point ${fmt(p)} is outside the view`);
          items.push({ type: 'point', index: i, el, at: p, on: null });
        } else {
          const f = fnRef(el.on!, at(i, 'on'));
          const x = num(el.x!, at(i, 'x'));
          if (!f) return;
          const y = f.fn(x);
          if (!Number.isFinite(y)) err(at(i, 'x'), `${f.id}(${x}) is not defined`);
          else if (!inView([x, y])) err(at(i), `point ${fmt([x, y])} on ${f.id} is outside the view`);
          addBreak(f, x);
          items.push({ type: 'point', index: i, el, at: [x, y], on: f });
        }
        return;
      }
      case 'segment':
        items.push({ type: 'segment', index: i, el, from: vec(el.from, at(i, 'from')), to: vec(el.to, at(i, 'to')) });
        return;
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
        items.push({ type: 'line', index: i, el, p, q });
        return;
      }
      case 'text': {
        const p = vec(el.at, at(i, 'at'));
        if (!inView(p)) err(at(i, 'at'), `text position ${fmt(p)} is outside the view`);
        items.push({ type: 'text', index: i, el, at: p });
        return;
      }
      case 'mathLabel': {
        const p = vec(el.at, at(i, 'at'));
        if (!inView(p)) err(at(i, 'at'), `label position ${fmt(p)} is outside the view`);
        items.push({ type: 'mathLabel', index: i, el, at: p });
        return;
      }
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, model: { figure, functions, items } };
}
