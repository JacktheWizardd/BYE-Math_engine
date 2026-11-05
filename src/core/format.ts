/** How a computed value is written: integers and simple fractions exactly, else 3 decimals. */
export interface FormattedValue {
  text: string;
  tex: string;
  /** True if the value was recognised as an integer or a simple fraction. */
  exact: boolean;
}

const MINUS = '−';

export function simpleFraction(x: number, maxDen = 12, tol = 1e-9): [number, number] | null {
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < tol * Math.max(1, Math.abs(x))) return [p, q];
  }
  return null;
}

/** Snaps values within rounding error of a simple fraction onto it (roots found by bisection). */
export function snap(x: number): number {
  if (!Number.isFinite(x)) return x;
  const f = simpleFraction(x, 12, 1e-9);
  return f ? f[0] / f[1] : x;
}

/** x as a simple multiple of π (kπ/q, q ≤ 6), or null. */
export function piMultiple(x: number): [number, number] | null {
  if (x === 0) return null;
  const f = simpleFraction(x / Math.PI, 6, 1e-9);
  return f && f[0] !== 0 ? f : null;
}

export function formatValue(x: number): FormattedValue {
  if (x === Infinity) return { text: '∞', tex: '\\infty', exact: true };
  if (x === -Infinity) return { text: `${MINUS}∞`, tex: '-\\infty', exact: true };
  const f = simpleFraction(x);
  const pi = f ? null : piMultiple(x);
  if (pi) {
    const [p, q] = pi;
    const k = Math.abs(p);
    const num = k === 1 ? 'π' : `${k}π`;
    const texNum = k === 1 ? '\\pi' : `${k}\\pi`;
    const sign = p < 0 ? '-' : '';
    return q === 1
      ? { text: `${p < 0 ? MINUS : ''}${num}`, tex: `${sign}${texNum}`, exact: true }
      : { text: `${p < 0 ? MINUS : ''}${num}/${q}`, tex: `${sign}\\tfrac{${texNum}}{${q}}`, exact: true };
  }
  if (f) {
    const [p, q] = f;
    if (q === 1) return { text: p < 0 ? `${MINUS}${-p}` : String(p), tex: String(p), exact: true };
    const sign = p < 0 ? '-' : '';
    return { text: `${p < 0 ? MINUS : ''}${Math.abs(p)}/${q}`, tex: `${sign}\\tfrac{${Math.abs(p)}}{${q}}`, exact: true };
  }
  const s = String(+x.toFixed(3));
  return { text: s.replace('-', MINUS), tex: s, exact: false };
}
