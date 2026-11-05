import type { Node, RawNode } from './ast.ts';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS } from './builtins.ts';
import { ExprError } from './errors.ts';

export interface Scope {
  /** Free variables allowed in this expression, e.g. ['x'] for y = f(x); [] for a constant. */
  variables: readonly string[];
  /** Ids of function elements that may be called, e.g. f in "f(1)". */
  functions: readonly string[];
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
      case 'apply': {
        const builtin = BUILTIN_FUNCTIONS[n.callee];
        if (builtin && Object.hasOwn(BUILTIN_FUNCTIONS, n.callee)) {
          if (!builtin.arity.includes(n.args.length)) {
            fail(`${n.callee} takes ${builtin.arity.join(' or ')} argument(s), got ${n.args.length}`, n);
          }
          return { type: 'call', fn: n.callee, builtin: true, args: n.args.map(walk) };
        }
        if (scope.functions.includes(n.callee)) {
          if (n.args.length !== 1) fail(`${n.callee} takes 1 argument, got ${n.args.length}`, n);
          return { type: 'call', fn: n.callee, builtin: false, args: n.args.map(walk) };
        }
        // Not callable: name(…) is implicit multiplication, e.g. x(x+1).
        if (n.args.length !== 1) fail(`"${n.callee}" is not a function`, n);
        return { type: 'bin', op: '*', left: value(n.callee, n), right: walk(n.args[0]!) };
      }
    }
  };

  return walk(raw);
}

/** Ids of function elements an expression calls (for the dependency graph). */
export function referencedFunctions(node: Node, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'neg':
      referencedFunctions(node.arg, out);
      break;
    case 'bin':
      referencedFunctions(node.left, out);
      referencedFunctions(node.right, out);
      break;
    case 'call':
      if (!node.builtin) out.add(node.fn);
      node.args.forEach((a) => referencedFunctions(a, out));
      break;
  }
  return out;
}
