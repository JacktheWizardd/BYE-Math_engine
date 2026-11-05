import { Fragment } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Primitive, Pt, Scene } from '../core/index.ts';
import { MathLabel, type MathLabelBackend } from './MathLabel.tsx';

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const pathOf = (pts: Pt[], close = false) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (close ? 'Z' : '');

/** Draws a scene with react-native-svg. Pure function of the scene + theme. */
export function SceneSvg({ scene, clipId, mathBackend }: { scene: Scene; clipId: string; mathBackend?: MathLabelBackend }) {
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
      {scene.primitives.map((p) => (
        <Fragment key={p.key}>{draw(p, scene, clip, mathBackend)}</Fragment>
      ))}
    </Svg>
  );
}

function draw(p: Primitive, scene: Scene, clip: string, mathBackend?: MathLabelBackend) {
  const style = scene.theme.roles[p.role];
  const clipPath = p.clip ? clip : undefined;
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
        />
      );
    case 'polygon':
      return <Path d={pathOf(p.points, true)} fill={style.color} fillOpacity={style.fillOpacity ?? 0.16} stroke="none" clipPath={clipPath} />;
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
          stroke={scene.theme.background}
          strokeWidth={1.5}
        />
      );
    case 'text': {
      const fonts = scene.theme.fonts;
      const family = p.font === 'note' ? fonts.note : p.font === 'mathItalic' ? fonts.mathItalic : fonts.math;
      return (
        <SvgText
          x={n(p.x)}
          y={n(p.y)}
          textAnchor={p.anchor}
          fontFamily={family}
          fontSize={p.fontSize}
          fill={style.labelColor ?? style.color}
        >
          {p.text}
        </SvgText>
      );
    }
    case 'mathLabel':
      return (
        <G>
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
