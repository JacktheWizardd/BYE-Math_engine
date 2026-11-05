import type { Node, RawNode } from './ast.ts';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS } from './builtins.ts';
import { ExprError } from './errors.ts';

export interface Scope {
  /** Free variables allowed in this expression, e.g. ['x'] for y = f(x); [] for a constant. */
  variables: readonly string[];
  /** Ids of function elements that may be called, e.g. f in "f(1)" or "f'(2)". */
  functions: readonly string[];
  /** Ids of point elements whose coordinates may be used, e.g. P in "P.x". */
  points?: readonly string[];
  /** Ids of other elements, only for clearer error messages ("s is a segment, not a point"). */
  others?: ReadonlyMap<string, string>;
}

/**
 * Turns the raw parse into a resolved AST. This is where `f(1)` (call) and
 * `x(x+1)` (implicit product) are told apart: a name followed by parentheses
 * is a call only if it names a built-in or a function element.
 */
export function resolve(raw: RawNode, scope: Scope, source: string): Node {
  const fail = (msg: string, n: { start: number; end: number }): never => {
    throw new ExprError(msg, source, n.start, n.end);
  };

  const isCallable = (name: string) => Object.hasOwn(BUILTIN_FUNCTIONS, name) || scope.functions.includes(name);

  const value = (name: string, n: RawNode): Node => {
    if (scope.variables.includes(name)) return { type: 'var', name };
    const c = BUILTIN_CONSTANTS[name];
    if (c !== undefined && Object.hasOwn(BUILTIN_CONSTANTS, name)) return { type: 'num', value: c };
    if (isCallable(name)) return fail(`"${name}" is a function; write ${name}(…)`, n);
    if (scope.points?.includes(name)) return fail(`"${name}" is a point; write ${name}.x or ${name}.y`, n);
    if (name === 'x') return fail('x is not allowed here; this value must be a constant', n);
    if (name.length > 1 && /^[a-z]+$/i.test(name)) {
      const prefix = Object.keys(BUILTIN_FUNCTIONS).find((f) => name.startsWith(f) && name.length > f.length);
      const hint = prefix ? `${prefix}(${name.slice(prefix.length)})` : name.split('').join('*');
      return fail(`Unknown name "${name}". Did you mean ${hint}?`, n);
    }
    return fail(`Unknown name "${name}"`, n);
  };

  const walk = (n: RawNode): Node => {
    switch (n.type) {
      case 'num':
        return { type: 'num', value: n.value };
      case 'name':
        return value(n.name, n);
      case 'neg':
        return { type: 'neg', arg: walk(n.arg) };
      case 'bin':
        return { type: 'bin', op: n.op, left: walk(n.left), right: walk(n.right) };
      case 'member': {
        if (scope.points?.includes(n.id)) return { type: 'member', id: n.id, axis: n.axis };
        const kind = scope.others?.get(n.id) ?? (scope.functions.includes(n.id) ? 'function' : undefined);
        return fail(kind ? `"${n.id}" is a ${kind}, not a point` : `No point with id "${n.id}"`, n);
      }
      case 'apply': {
        const builtin = BUILTIN_FUNCTIONS[n.callee];
        if (builtin && Object.hasOwn(BUILTIN_FUNCTIONS, n.callee)) {
          if (n.order > 0) fail(`Write the derivative of ${n.callee} out, or define it as a function element`, n);
          if (!builtin.arity.includes(n.args.length)) {
            fail(`${n.callee} takes ${builtin.arity.join(' or ')} argument(s), got ${n.args.length}`, n);
          }
          return { type: 'call', fn: n.callee, builtin: true, order: 0, args: n.args.map(walk) };
        }
        if (scope.functions.includes(n.callee)) {
          if (n.args.length !== 1) fail(`${n.callee} takes 1 argument, got ${n.args.length}`, n);
          return { type: 'call', fn: n.callee, builtin: false, order: n.order, args: n.args.map(walk) };
        }
        if (n.order > 0) {
          const kind = scope.others?.get(n.callee);
          fail(kind ? `"${n.callee}" is a ${kind}, not a function` : `No function with id "${n.callee}"`, n);
        }
        // Not callable: name(…) is implicit multiplication, e.g. x(x+1).
        if (n.args.length !== 1) fail(`"${n.callee}" is not a function`, n);
        return { type: 'bin', op: '*', left: value(n.callee, n), right: walk(n.args[0]!) };
      }
    }
  };

  return walk(raw);
}

/** Ids of elements an expression refers to: called functions and points (for the dependency graph). */
export function referencedIds(node: Node, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'neg':
      referencedIds(node.arg, out);
      break;
    case 'bin':
      referencedIds(node.left, out);
      referencedIds(node.right, out);
      break;
    case 'call':
      if (!node.builtin) out.add(node.fn);
      node.args.forEach((a) => referencedIds(a, out));
      break;
    case 'member':
      out.add(node.id);
      break;
  }
  return out;
}

/** @deprecated use referencedIds */
export const referencedFunctions = referencedIds;
