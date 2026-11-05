import { useId, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ByeLightTheme, DEFAULT_ASPECT, figureToScene, type ByeTheme, type Measure } from '../core/index.ts';
import type { FigureIssue } from '../spec/index.ts';
import { FigureError } from './FigureError.tsx';
import { mathJaxBackend, type MathLabelBackend } from './MathLabel.tsx';
import { SceneSvg } from './renderScene.tsx';

export interface ByeFigureProps {
  /** The figure description (JSON from the problem). Validated here; bad input shows an error box, never crashes. */
  figure: unknown;
  /** Width in pt. If omitted, the figure fills its container's width. */
  width?: number;
  theme?: ByeTheme;
  style?: StyleProp<ViewStyle>;
  /** Called with validation errors (e.g. to log bad problems). */
  onError?: (errors: FigureIssue[]) => void;
  /** Show error details in the error box (defaults to __DEV__). */
  showErrorDetails?: boolean;
  /** Swap the TeX renderer used for math labels. */
  mathBackend?: MathLabelBackend;
}

const describeOf = (figure: unknown): string | undefined => {
  const d = (figure as { describe?: unknown } | null)?.describe;
  return typeof d === 'string' && d.trim() ? d : undefined;
};

/** Draws a BYE Math figure natively with react-native-svg. */
export function ByeFigure({ figure, width: fixedWidth, theme = ByeLightTheme, style, onError, showErrorDetails, mathBackend = mathJaxBackend }: ByeFigureProps) {
  const [measured, setMeasured] = useState<number | null>(null);
  const width = fixedWidth ?? measured;
  const clipId = `bye-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const result = useMemo(() => {
    if (!width) return null;
    const measure: Partial<Measure> = { tex: (tex, fs) => mathBackend.measure(tex, fs) };
    return figureToScene(figure, { width, theme, measure });
  }, [figure, width, theme, mathBackend]);

  const reported = useMemo(() => {
    if (result && !result.ok) onError?.(result.errors);
    return true;
  }, [result, onError]);
  void reported;

  const onLayout = fixedWidth ? undefined : (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  const aspect = (figure as { aspect?: number } | null)?.aspect ?? DEFAULT_ASPECT;
  const containerStyle: StyleProp<ViewStyle> = [fixedWidth ? { width: fixedWidth } : { alignSelf: 'stretch' }, style];

  if (!result) {
    // First layout pass: reserve the space so the page doesn't jump.
    return <View style={[containerStyle, { aspectRatio: aspect }]} onLayout={onLayout} />;
  }
  if (!result.ok) {
    const d = describeOf(figure);
    return (
      <View style={containerStyle} onLayout={onLayout}>
        <FigureError
          errors={result.errors}
          theme={theme}
          {...(d ? { describe: d } : {})}
          {...(showErrorDetails !== undefined ? { showDetails: showErrorDetails } : {})}
        />
      </View>
    );
  }
  const { scene } = result;
  return (
    <View
      style={containerStyle}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={scene.describe}
    >
      <SceneSvg scene={scene} clipId={clipId} mathBackend={mathBackend} />
    </View>
  );
}
