import { useId, useMemo, useState, type ComponentType } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ByeLightTheme, DEFAULT_ASPECT, figureToScene, frameAt, timeline, type ByeTheme, type Measure } from '../core/index.ts';
import type { FigureIssue } from '../spec/index.ts';
import { FigureError } from './FigureError.tsx';
import { mathJaxBackend, type MathLabelBackend } from './MathLabel.tsx';
import { rafDriver, useFigureClock, type AnimationDriver } from './animation.ts';
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
  /** Play the figure's `animate` motion when it appears (default true). False shows the final state. */
  animate?: boolean;
  /** Change this value to play the animation again. */
  replayKey?: unknown;
  /** Called when the animation finishes. */
  onAnimationEnd?: () => void;
  /** Override the system Reduce Motion setting (true = never animate). */
  reduceMotion?: boolean;
  /** Clock used for animation (default: requestAnimationFrame). */
  animationDriver?: AnimationDriver;
  /**
   * 3D only: slowly turn the figure (degrees per second; true = 10) after its
   * animation, to show it can be rotated. Stops for good once the user drags it.
   * Never under Reduce Motion, and not for figures with "rotate": false.
   */
  autoRotate?: boolean | number;
}

const describeOf = (figure: unknown): string | undefined => {
  const d = (figure as { describe?: unknown } | null)?.describe;
  return typeof d === 'string' && d.trim() ? d : undefined;
};

/** Renderers for figure kinds drawn outside react-native-svg (plot3d → bye-math-engine/native3d). */
const kindRenderers = new Map<string, ComponentType<ByeFigureProps>>();

/** Registers a component that draws figures of `kind` (used by bye-math-engine/native3d). */
export function registerFigureRenderer(kind: string, component: ComponentType<ByeFigureProps>) {
  kindRenderers.set(kind, component);
}

/** Draws a BYE Math figure natively: 2D kinds with react-native-svg, others with a registered renderer. */
export function ByeFigure(props: ByeFigureProps) {
  const kind = (props.figure as { kind?: unknown } | null)?.kind;
  const Custom = typeof kind === 'string' ? kindRenderers.get(kind) : undefined;
  return Custom ? <Custom {...props} /> : <ByeFigure2D {...props} />;
}

function ByeFigure2D({
  figure,
  width: fixedWidth,
  theme = ByeLightTheme,
  style,
  onError,
  showErrorDetails,
  mathBackend = mathJaxBackend,
  animate = true,
  replayKey,
  onAnimationEnd,
  reduceMotion,
  animationDriver = rafDriver,
}: ByeFigureProps) {
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

  // --- animation: a clock in ms; frames are computed from the scene (pure, see core/animate.ts)
  const scene = result?.ok ? result.scene : null;
  const total = scene ? timeline(scene) : 0;
  // Replays when the figure or replayKey changes; not on resize.
  const clock = useFigureClock({ total, animate, reduceMotion, driver: animationDriver, restartKeys: [figure, replayKey], onEnd: onAnimationEnd });
  const { wantsMotion, reduce, playing } = clock;

  const onLayout = fixedWidth ? undefined : (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  // Space reserved before the first layout: the figure's own aspect, else its kind's usual shape.
  const kindAspect: Record<string, number> = { numberLine: 3.3, signChart: 2.4, chart: 4 / 3 };
  const f = figure as { aspect?: number; kind?: string } | null;
  const aspect = f?.aspect ?? kindAspect[f?.kind ?? ''] ?? DEFAULT_ASPECT;
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
  const s = result.scene;
  // Until Reduce Motion is known, hold the first frame so nothing flashes in its final state.
  const primitives = !wantsMotion || reduce === true || clock.done ? s.primitives : frameAt(s, playing ? clock.ms : 0);
  if (s.scroll) {
    // Wider than the screen (e.g. a sign chart with many columns): scroll sideways,
    // with the heading column drawn again on top, pinned to the left.
    const { viewportWidth, frozenWidth } = s.scroll;
    return (
      <View
        style={containerStyle}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={s.describe}
        accessibilityHint="Scroll sideways to see every column"
      >
        <View style={{ width: viewportWidth, height: s.height }}>
          <ScrollView horizontal showsHorizontalScrollIndicator bounces={false} contentContainerStyle={{ width: s.width }}>
            <SceneSvg scene={s} primitives={primitives} clipId={clipId} mathBackend={mathBackend} />
          </ScrollView>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, top: 0, width: frozenWidth + 1, height: s.height, overflow: 'hidden', backgroundColor: theme.background }}
          >
            <SceneSvg scene={s} primitives={primitives} clipId={`${clipId}-frozen`} mathBackend={mathBackend} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View
      style={containerStyle}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={s.describe}
    >
      <SceneSvg scene={s} primitives={primitives} clipId={clipId} mathBackend={mathBackend} />
    </View>
  );
}
