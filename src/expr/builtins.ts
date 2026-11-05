/** Built-in functions and constants available in every expression. */
export interface Builtin {
  arity: readonly number[];
  fn: (...args: number[]) => number;
}

const log = (a: number, b?: number) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a));

export const BUILTIN_FUNCTIONS: Readonly<Record<string, Builtin>> = {
  sin: { arity: [1], fn: Math.sin },
  cos: { arity: [1], fn: Math.cos },
  tan: { arity: [1], fn: Math.tan },
  sec: { arity: [1], fn: (a) => 1 / Math.cos(a) },
  csc: { arity: [1], fn: (a) => 1 / Math.sin(a) },
  cot: { arity: [1], fn: (a) => 1 / Math.tan(a) },
  asin: { arity: [1], fn: Math.asin },
  acos: { arity: [1], fn: Math.acos },
  atan: { arity: [1], fn: Math.atan },
  arcsin: { arity: [1], fn: Math.asin },
  arccos: { arity: [1], fn: Math.acos },
  arctan: { arity: [1], fn: Math.atan },
  sinh: { arity: [1], fn: Math.sinh },
  cosh: { arity: [1], fn: Math.cosh },
  tanh: { arity: [1], fn: Math.tanh },
  sqrt: { arity: [1], fn: Math.sqrt },
  cbrt: { arity: [1], fn: Math.cbrt },
  abs: { arity: [1], fn: Math.abs },
  exp: { arity: [1], fn: Math.exp },
  ln: { arity: [1], fn: Math.log },
  // log(x) is base 10; log(b, x) is base b.
  log: { arity: [1, 2], fn: (a, b) => log(a, b) },
  floor: { arity: [1], fn: Math.floor },
  ceil: { arity: [1], fn: Math.ceil },
  round: { arity: [1], fn: Math.round },
  sign: { arity: [1], fn: Math.sign },
  min: { arity: [2], fn: Math.min },
  max: { arity: [2], fn: Math.max },
};

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
};

export const isReservedName = (name: string): boolean =>
  Object.hasOwn(BUILTIN_FUNCTIONS, name) || Object.hasOwn(BUILTIN_CONSTANTS, name) || name === 'x';
