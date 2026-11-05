import { memo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { ByeTheme, Primitive, Pt, Scene } from '../core/index.ts';
import { MathLabel, type MathLabelBackend } from './MathLabel.tsx';

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const pathOf = (pts: Pt[], close = false) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (close ? 'Z' : '');

/**
 * Draws a scene with react-native-svg. `primitives` defaults to the scene's own;
 * during an animation it is the current frame. Each primitive is memoised by
 * identity, so per frame only the animated pieces re-render.
 */
export function SceneSvg({
  scene,
  primitives = scene.primitives,
  clipId,
  mathBackend,
}: {
  scene: Scene;
  primitives?: Primitive[];
  clipId: string;
  mathBackend?: MathLabelBackend;
}) {
  const { theme, plot } = scene;
  const clip = `url(#${clipId})`;
  return (
    <Svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
      {theme.transparentBackground ? null : <Rect x={0} y={0} width={scene.width} height={scene.height} fill={theme.background} />}
      <Defs>
        <ClipPath id={clipId}>
          {/* A little slack so 2.5px strokes at the plot edge aren't cut in half. */}
          <Rect x={plot.x - 2} y={plot.y - 2} width={plot.width + 4} height={plot.height + 4} />
        </ClipPath>
      </Defs>
      {primitives.map((p) => (
        <PrimitiveView key={p.key} p={p} theme={theme} clip={clip} mathBackend={mathBackend} />
      ))}
    </Svg>
  );
}

const PrimitiveView = memo(function PrimitiveView({
  p,
  theme,
  clip,
  mathBackend,
}: {
  p: Primitive;
  theme: ByeTheme;
  clip: string;
  mathBackend?: MathLabelBackend | undefined;
}) {
  return draw(p, theme, clip, mathBackend);
});

function draw(p: Primitive, theme: ByeTheme, clip: string, mathBackend?: MathLabelBackend) {
  const style = theme.roles[p.role];
  const clipPath = p.clip ? clip : undefined;
  const opacity = p.opacity;
  switch (p.kind) {
    case 'polyline':
      if (p.points.length < 2) return null;
      return (
        <Path
          d={pathOf(p.points)}
          stroke={style.color}
          strokeWidth={style.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
          clipPath={clipPath}
          opacity={opacity}
        />
      );
    case 'polygon':
      return <Path d={pathOf(p.points, true)} fill={style.color} fillOpacity={style.fillOpacity ?? 0.16} stroke="none" clipPath={clipPath} opacity={opacity} />;
    case 'line': {
      const thin = p.role === 'grid' || p.role === 'axis';
      return (
        <Line
          x1={n(p.from[0])}
          y1={n(p.from[1])}
          x2={n(p.to[0])}
          y2={n(p.to[1])}
          stroke={style.color}
          strokeWidth={style.strokeWidth}
          strokeLinecap={thin ? 'butt' : 'round'}
          clipPath={clipPath}
          opacity={opacity}
        />
      );
    }
    case 'circle':
      return (
        <Circle
          cx={n(p.center[0])}
          cy={n(p.center[1])}
          r={p.r}
          fill={style.color}
          stroke={theme.background}
          strokeWidth={1.5}
          opacity={opacity}
        />
      );
    case 'text': {
      const fonts = theme.fonts;
      const family = p.font === 'note' ? fonts.note : p.font === 'mathItalic' ? fonts.mathItalic : fonts.math;
      return (
        <SvgText
          x={n(p.x)}
          y={n(p.y)}
          textAnchor={p.anchor}
          fontFamily={family}
          fontSize={p.fontSize}
          fill={style.labelColor ?? style.color}
          opacity={opacity}
        >
          {p.text}
        </SvgText>
      );
    }
    case 'mathLabel':
      return (
        <G opacity={opacity}>
          <MathLabel
            tex={p.tex}
            x={p.box.x}
            y={p.box.y}
            fontSize={p.fontSize}
            color={style.labelColor ?? style.color}
            {...(mathBackend ? { backend: mathBackend } : {})}
          />
        </G>
      );
  }
}
