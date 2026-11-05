import type { RawNode } from './ast.ts';
import { BUILTIN_FUNCTIONS } from './builtins.ts';

const prec = (n: RawNode): number => {
  if (n.type === 'bin') return n.op === '+' || n.op === '-' ? 1 : n.op === '^' ? 4 : 2;
  if (n.type === 'neg') return 3;
  return 5;
};

const TEX_FUNCS: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log: '\\log', exp: '\\exp',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan',
};

/** Writes an expression as TeX, keeping how it was written (pi stays \pi, 2x stays 2x). Used for default row headings. */
export function toTex(n: RawNode): string {
  const wrap = (c: RawNode, min: number) => (prec(c) < min ? `\\left(${toTex(c)}\\right)` : toTex(c));
  switch (n.type) {
    case 'num':
      return String(n.value);
    case 'name':
      return n.name === 'pi' ? '\\pi' : n.name.length > 1 ? `\\mathrm{${n.name}}` : n.name;
    case 'member':
      return `${n.id}_{${n.axis}}`;
    case 'neg':
      return `-${wrap(n.arg, 3)}`;
    case 'bin': {
      const { op, left, right } = n;
      if (op === '/') return `\\frac{${toTex(left)}}{${toTex(right)}}`;
      if (op === '^') return `{${wrap(left, 5)}}^{${toTex(right)}}`;
      if (op === '+') return `${toTex(left)} + ${toTex(right)}`;
      if (op === '-') return `${toTex(left)} - ${wrap(right, 2)}`;
      // multiplication: juxtapose where it reads naturally (2x, 3\sin x, (x-1)(x+2))
      const l = wrap(left, 2);
      const r = wrap(right, 3);
      const rightStartsWithDigit = /^[0-9]/.test(r);
      return n.implicit || !rightStartsWithDigit ? `${l}${/^[a-zA-Z0-9]$/.test(l.slice(-1)) && /^\\[a-z]/.test(r) ? ' ' : ''}${r}` : `${l} \\cdot ${r}`;
    }
    case 'apply': {
      const args = n.args.map(toTex).join(', ');
      const primes = "'".repeat(n.order);
      if (n.callee === 'sqrt' && n.args.length === 1) return `\\sqrt{${args}}`;
      if (n.callee === 'cbrt' && n.args.length === 1) return `\\sqrt[3]{${args}}`;
      if (n.callee === 'abs' && n.args.length === 1) return `\\left|${args}\\right|`;
      const f = TEX_FUNCS[n.callee] ?? (Object.hasOwn(BUILTIN_FUNCTIONS, n.callee) ? `\\operatorname{${n.callee}}` : n.callee);
      return `${f}${primes}\\left(${args}\\right)`;
    }
  }
}
