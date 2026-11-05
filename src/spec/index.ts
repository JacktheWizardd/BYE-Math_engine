import { z } from 'zod';
import { ELEMENT_TYPES, Figure } from './schema.ts';

export * from './schema.ts';

export interface FigureIssue {
  /** Where in the figure JSON, e.g. "elements[2].y". Empty for the whole figure. */
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; figure: T } | { ok: false; errors: FigureIssue[] };

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), '');
}

/**
 * Structural validation of a figure description (shape, types, required fields).
 * Expressions and references are checked by `compileFigure` in the core.
 */
export function validateSpec(input: unknown): ValidationResult<Figure> {
  const errors: FigureIssue[] = [];

  // Friendlier messages for the two most likely mistakes before zod's generic ones.
  if (typeof input === 'object' && input !== null) {
    const o = input as Record<string, unknown>;
    if ('spec' in o && o.spec !== 0) {
      errors.push({ path: 'spec', message: `Unsupported spec version ${JSON.stringify(o.spec)}; this engine reads spec 0` });
    }
    if (Array.isArray(o.elements)) {
      o.elements.forEach((el, i) => {
        const t = (el as { type?: unknown } | null)?.type;
        if (typeof t !== 'string' || !(ELEMENT_TYPES as readonly string[]).includes(t)) {
          errors.push({
            path: `elements[${i}].type`,
            message: `Unknown element type ${JSON.stringify(t)}. Supported: ${ELEMENT_TYPES.join(', ')}`,
          });
        }
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  const parsed = Figure.safeParse(input);
  if (parsed.success) return { ok: true, figure: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
  };
}

/** JSON Schema for the figure description (for authoring tools and AI prompts). */
export function figureJsonSchema(): unknown {
  return z.toJSONSchema(Figure, { io: 'input' });
}
