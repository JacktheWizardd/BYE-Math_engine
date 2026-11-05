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
  | ({ type: 'member'; id: string; axis: 'x' | 'y' | 'z' } & Span);

export type BinOp = '+' | '-' | '*' | '/' | '^';

/** Resolved AST: every name is known to be a variable, constant or callable. */
export type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: BinOp; left: Node; right: Node }
  /**
   * Built-in call, or a function element. One-variable f: `order` = number of derivatives (f' has 1).
   * Two-variable f(x, y): `partial` lists the partial derivatives taken, e.g. "x" for f_x, "xy" for f_xy.
   */
  | { type: 'call'; fn: string; builtin: boolean; order: number; partial?: string; args: Node[] }
  /** A coordinate of a point element: P.x, P.y, P.z */
  | { type: 'member'; id: string; axis: 'x' | 'y' | 'z' };
