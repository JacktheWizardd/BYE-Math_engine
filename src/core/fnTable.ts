import { compile, derive, NoSymbolicDerivative, numericDerivative, type Fn1, type FunctionTable, type Node } from '../expr/index.ts';

/**
 * Function table for named functions (used by sign charts): f, f', f'', … compiled lazily,
 * symbolic derivatives with a numeric fallback (same rules as plot2d).
 */
export function makeFunctionTable(defs: ReadonlyMap<string, Node>): FunctionTable {
  const cache = new Map<string, { node: Node | null; fn: Fn1 }>();
  const table: FunctionTable = (id, order) => {
    const base = defs.get(id);
    if (!base) return undefined;
    const key = `${id}:${order}`;
    const hit = cache.get(key);
    if (hit) return hit.fn;
    let entry: { node: Node | null; fn: Fn1 };
    if (order === 0) entry = { node: base, fn: compile(base, table) };
    else {
      table(id, order - 1);
      const prev = cache.get(`${id}:${order - 1}`)!;
      try {
        if (!prev.node) throw new NoSymbolicDerivative(id);
        const node = derive(prev.node);
        entry = { node, fn: compile(node, table) };
      } catch (e) {
        if (!(e instanceof NoSymbolicDerivative)) throw e;
        entry = { node: null, fn: (x) => numericDerivative(prev.fn, x) };
      }
    }
    cache.set(key, entry);
    return entry.fn;
  };
  return table;
}
