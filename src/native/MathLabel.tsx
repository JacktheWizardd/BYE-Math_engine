import { memo } from 'react';
import { G, parse as parseSvg, type JsxAST } from 'react-native-svg';
import { texToSvg } from 'react-native-mathjax-svg';
import './mathjax-svg.ts';

/**
 * Math labels. This is the only file that knows which TeX renderer is used,
 * so it can be swapped (another native lib, pre-rendered SVG) without touching
 * the core or the rest of the renderer.
 *
 * Current backend: react-native-mathjax-svg (MIT) → MathJax 3 (Apache-2.0) SVG
 * output, drawn with react-native-svg. No WebView.
 *
 * The wrapper's own component nests a second <Svg>, and iOS ignores a nested
 * <Svg>'s x/y (every label landed at the top-left). So we take its markup,
 * parse it with react-native-svg, and draw the glyphs inside a translated,
 * scaled <G> in the figure's own <Svg>.
 */
export interface MathLabelBackend {
  measure(tex: string, fontSize: number): { width: number; height: number };
  render(props: MathLabelProps): React.ReactElement | null;
}

export interface MathLabelProps {
  tex: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

interface Parsed {
  /** MathJax SVG markup without the root's size/style attributes. */
  body: string;
  widthEx: number;
  heightEx: number;
  /** Root viewBox [minX, minY, width, height] in MathJax units. */
  viewBox: [number, number, number, number];
}

const cache = new Map<string, Parsed | null>();

function parse(tex: string): Parsed | null {
  if (cache.has(tex)) return cache.get(tex)!;
  let out: Parsed | null = null;
  try {
    const svg = texToSvg(tex, 1);
    const head = svg.match(/<svg[^>]*>/)?.[0] ?? '';
    const w = parseFloat(head.match(/width="([\d.]+)ex"/)?.[1] ?? '');
    const h = parseFloat(head.match(/height="([\d.]+)ex"/)?.[1] ?? '');
    // MathJax reports TeX errors inside the SVG (merror) rather than throwing.
    const isError = /data-mjx-error|merror/.test(svg);
    const vb = (head.match(/viewBox="([^"]+)"/)?.[1] ?? '').trim().split(/[\s,]+/).map(Number);
    const viewBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 ? (vb as [number, number, number, number]) : null;
    if (Number.isFinite(w) && Number.isFinite(h) && viewBox && !isError) {
      const cleanHead = head.replace(/\s(width|height|style|role|focusable)="[^"]*"/g, '');
      // data-* attributes are MathJax bookkeeping; react-native-svg would pass them on as unknown props.
      const body = svg.replace(head, cleanHead).replace(/\sdata-[a-z-]+="[^"]*"/g, '');
      out = { body, widthEx: w, heightEx: h, viewBox };
    }
  } catch {
    out = null;
  }
  cache.set(tex, out);
  return out;
}

const astCache = new Map<string, JsxAST | null>();

/** Parsed element tree for a label in one colour (cached). */
function astFor(p: Parsed, color: string): JsxAST | null {
  const key = `${color}\u0000${p.body}`;
  if (!astCache.has(key)) {
    let ast: JsxAST | null = null;
    try {
      ast = parseSvg(p.body.replace(/currentColor/g, color));
    } catch {
      ast = null;
    }
    astCache.set(key, ast);
  }
  return astCache.get(key)!;
}

/** MathJax's ex is half the font size (em = 16, ex = 8 in the wrapper's setup). */
const EX_PER_FONT = 0.5;

export const mathJaxBackend: MathLabelBackend = {
  measure(tex, fontSize) {
    const p = parse(tex);
    if (!p) return { width: tex.length * fontSize * 0.5, height: fontSize * 1.3 };
    return { width: p.widthEx * fontSize * EX_PER_FONT, height: p.heightEx * fontSize * EX_PER_FONT };
  },
  render({ tex, x, y, fontSize, color }) {
    const p = parse(tex);
    if (!p) return null;
    const ast = astFor(p, color);
    if (!ast) return null;
    const [vx, vy, vw] = p.viewBox;
    const s = (p.widthEx * fontSize * EX_PER_FONT) / vw;
    return <G transform={`translate(${x} ${y}) scale(${s}) translate(${-vx} ${-vy})`}>{ast.children}</G>;
  },
};

/** True if the backend can lay out this TeX (used for validation-style fallbacks). */
export const canRenderTex = (tex: string) => parse(tex) !== null;

export const MathLabel = memo(function MathLabel(props: MathLabelProps & { backend?: MathLabelBackend }) {
  const backend = props.backend ?? mathJaxBackend;
  return backend.render(props);
});
