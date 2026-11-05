import type { Node, RawNode } from './ast.ts';
import { compile, type Fn1, type FunctionTable, type PointTable } from './compile.ts';
import { ExprError } from './errors.ts';
import { parse as peggyParse } from './parser.generated.js';
import { resolve, type Scope } from './resolve.ts';

export type { Node, RawNode, BinOp } from './ast.ts';
export { ExprError } from './errors.ts';
export { compile, type Fn1, type FunctionTable, type PointTable } from './compile.ts';
export { resolve, referencedIds, referencedFunctions, type Scope } from './resolve.ts';
export { derive, NoSymbolicDerivative, numericDerivative, dependsOnX, simplify } from './derive.ts';
export { BUILTIN_FUNCTIONS, BUILTIN_CONSTANTS, isReservedName } from './builtins.ts';

/** Parses an expression string into a raw AST. Throws ExprError with a position. */
export function parseRaw(source: string): RawNode {
  try {
    return peggyParse(source) as RawNode;
  } catch (e) {
    const err = e as { message?: string; location?: { start: { offset: number }; end: { offset: number } } };
    if (err.location) {
      const at = err.location.start.offset;
      const found = source.slice(at, at + 1);
      const msg = found ? `Unexpected "${found}" at position ${at + 1}` : 'Expression ends too early';
      throw new ExprError(msg, source, at, Math.max(at + 1, err.location.end.offset));
    }
    throw new ExprError(err.message ?? 'Invalid expression', source, 0, source.length);
  }
}

/** Parse + resolve. Throws ExprError. */
export function parseExpr(source: string, scope: Scope): Node {
  if (source.trim() === '') throw new ExprError('Expression is empty', source, 0, 1);
  return resolve(parseRaw(source), scope, source);
}

/** Parse, resolve and compile in one go. */
export function compileExpr(source: string, scope: Scope, functions?: FunctionTable, points?: PointTable): Fn1 {
  return compile(parseExpr(source, scope), functions, points);
}

export const isExprError = (e: unknown): e is ExprError => e instanceof ExprError;
