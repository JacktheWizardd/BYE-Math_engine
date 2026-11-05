/** Raw AST from the Peggy parser. Offsets index into the source string. */
interface Span {
  start: number;
  end: number;
}

export type RawNode =
  | ({ type: 'num'; value: number } & Span)
  | ({ type: 'name'; name: string } & Span)
  | ({ type: 'neg'; arg: RawNode } & Span)
  | ({ type: 'bin'; op: BinOp; left: RawNode; right: RawNode; implicit: boolean } & Span)
  | ({ type: 'apply'; callee: string; order: number; args: RawNode[] } & Span)
  | ({ type: 'member'; id: string; axis: 'x' | 'y' } & Span);

export type BinOp = '+' | '-' | '*' | '/' | '^';

/** Resolved AST: every name is known to be a variable, constant or callable. */
export type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: BinOp; left: Node; right: Node }
  /** Built-in call, or a function element (order = number of derivatives: f' has order 1). */
  | { type: 'call'; fn: string; builtin: boolean; order: number; args: Node[] }
  /** A coordinate of a point element: P.x */
  | { type: 'member'; id: string; axis: 'x' | 'y' };
