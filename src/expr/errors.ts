/** An error in an expression string, with the character range it refers to. */
export class ExprError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly start: number,
    readonly end: number = start + 1,
  ) {
    super(message);
    this.name = 'ExprError';
  }

  /** Message plus the source with a caret line under the bad part. */
  describe(): string {
    const width = Math.max(1, this.end - this.start);
    return `${this.message}\n  ${this.source}\n  ${' '.repeat(this.start)}${'^'.repeat(width)}`;
  }
}
