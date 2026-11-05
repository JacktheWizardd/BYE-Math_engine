import { z } from 'zod';
import { CHART_TYPES, ChartFigure, ELEMENT_TYPES, Figure, FIGURE_KINDS, NUMBER_LINE_ELEMENT_TYPES, NumberLineFigure, Plot2dFigure, Plot3dFigure, PLOT3D_ELEMENT_TYPES, SignChartFigure } from './schema.ts';

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

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', message: `A figure must be a JSON object, got ${input === null ? 'null' : Array.isArray(input) ? 'an array' : typeof input}` }] };
  }
  // Friendlier messages for the most likely mistakes before zod's generic ones.
  if (typeof input === 'object' && input !== null) {
    const o = input as Record<string, unknown>;
    if ('spec' in o && o.spec !== 0) {
      errors.push({ path: 'spec', message: `Unsupported spec version ${JSON.stringify(o.spec)}; this engine reads spec 0` });
    }
    if (typeof o.kind !== 'string' || !(FIGURE_KINDS as readonly string[]).includes(o.kind)) {
      errors.push({ path: 'kind', message: `Unknown figure kind ${JSON.stringify(o.kind)}. Supported: ${FIGURE_KINDS.join(', ')}` });
    } else if (o.kind === 'chart' && (typeof o.type !== 'string' || !(CHART_TYPES as readonly string[]).includes(o.type))) {
      errors.push({ path: 'type', message: `Unknown chart type ${JSON.stringify(o.type)}. Supported: ${CHART_TYPES.join(', ')}` });
    }
    const types: Record<string, readonly string[]> = { plot2d: ELEMENT_TYPES, plot3d: PLOT3D_ELEMENT_TYPES, numberLine: NUMBER_LINE_ELEMENT_TYPES };
    const allowed = typeof o.kind === 'string' ? types[o.kind] : undefined;
    if (allowed && Array.isArray(o.elements)) {
      o.elements.forEach((el, i) => {
        const t = (el as { type?: unknown } | null)?.type;
        if (typeof t !== 'string' || !allowed.includes(t)) {
          errors.push({ path: `elements[${i}].type`, message: `Unknown element type ${JSON.stringify(t)}. Supported: ${allowed.join(', ')}` });
        }
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  // Validate against the schema for this kind, so errors are specific (not "no union member matched").
  const kind = (input as { kind?: string }).kind;
  const schema =
    kind === 'numberLine' ? NumberLineFigure : kind === 'signChart' ? SignChartFigure : kind === 'chart' ? ChartFigure : kind === 'plot3d' ? Plot3dFigure : Plot2dFigure;
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, figure: parsed.data as Figure };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
  };
}

/** JSON Schema for the figure description (for authoring tools and AI prompts). */
export function figureJsonSchema(): unknown {
  return z.toJSONSchema(Figure, { io: 'input' });
}
