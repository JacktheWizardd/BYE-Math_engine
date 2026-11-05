import { GLView } from 'expo-gl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { ByeLightTheme, figureToScene3d, frameAt, overlay3d, timeline3d, type Camera, type Scene } from '../core/index.ts';
import type { FigureIssue } from '../spec/index.ts';
import { rafDriver, useFigureClock } from '../native/animation.ts';
import type { ByeFigureProps } from '../native/ByeFigure.tsx';
import { FigureError } from '../native/FigureError.tsx';
import { mathJaxBackend } from '../native/MathLabel.tsx';
import { SceneSvg } from '../native/renderScene.tsx';
import { createGLScene, type GLContext, type GLScene } from './glRenderer.ts';

const describeOf = (figure: unknown): string | undefined => {
  const d = (figure as { describe?: unknown } | null)?.describe;
  return typeof d === 'string' && d.trim() ? d : undefined;
};

/**
 * Draws a plot3d figure with three.js on expo-gl, with labels in an SVG overlay
 * at projected positions. One-finger drag orbits the camera (unless the figure
 * sets "rotate": false). Same props and behaviour as ByeFigure.
 */
export function ByeFigure3D({
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
  const clipId = `bye3d-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [glError, setGlError] = useState<FigureIssue[] | null>(null);

  const result = useMemo(() => (width ? figureToScene3d(figure, { width, theme }) : null), [figure, width, theme]);
  const scene = result?.ok ? result.scene : null;
  useEffect(() => {
    if (result && !result.ok) onError?.(result.errors);
  }, [result, onError]);

  // camera: starts at the author's view; drag to orbit
  const [camera, setCamera] = useState<Camera | null>(null);
  useEffect(() => setCamera(scene ? scene.camera : null), [scene]);
  const cam = camera ?? scene?.camera ?? { azimuth: -55, elevation: 25, zoom: 1 };
  const camRef = useRef(cam);
  camRef.current = cam;
  const start = useRef(cam);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!scene?.rotate,
        onMoveShouldSetPanResponder: () => !!scene?.rotate,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = camRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const s0 = start.current;
          setCamera({ ...s0, azimuth: s0.azimuth - g.dx * 0.45, elevation: Math.max(-85, Math.min(85, s0.elevation + g.dy * 0.35)) });
        },
      }),
    [scene],
  );

  // animation clock (shared with 2D figures)
  const total = scene ? timeline3d(scene) : 0;
  const clock = useFigureClock({ total, animate, reduceMotion, driver: animationDriver, restartKeys: [figure, replayKey], onEnd: onAnimationEnd });
  const ms = !clock.wantsMotion || clock.reduce === true || clock.done ? Infinity : clock.playing ? clock.ms : 0;

  // GL: build once per scene, redraw on camera / time change
  const gl = useRef<GLScene | null>(null);
  const ctxRef = useRef<GLContext | null>(null);
  const [glReady, setGlReady] = useState(0);
  useEffect(() => () => gl.current?.dispose(), []);
  const build = (ctx: GLContext) => {
    if (!scene) return;
    try {
      gl.current?.dispose();
      gl.current = createGLScene(ctx, scene, ctx.drawingBufferWidth / scene.width);
      setGlReady((n) => n + 1);
    } catch (e) {
      setGlError([{ path: '', message: `3D drawing isn't available here: ${String((e as Error)?.message ?? e)}` }]);
    }
  };
  const onContextCreate = (ctx: GLContext) => {
    ctxRef.current = ctx;
    build(ctx);
  };
  // A new figure on the same GL view: rebuild the three.js scene.
  useEffect(() => {
    if (ctxRef.current) build(ctxRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  useEffect(() => {
    gl.current?.render(cam, ms);
  }, [cam, ms, glReady]);

  // overlay: labels and ticks at projected positions
  const overlay = useMemo<Scene | null>(() => {
    if (!scene) return null;
    const primitives = overlay3d(scene, cam, { tex: (tex, fs) => mathBackend.measure(tex, fs) });
    return { width: scene.width, height: scene.height, plot: { x: 0, y: 0, width: scene.width, height: scene.height }, viewport: { x: [0, 1], y: [0, 1], width: scene.width, height: scene.height, padding: { top: 0, right: 0, bottom: 0, left: 0 } }, primitives, describe: scene.describe, samples: {}, theme: { ...scene.theme, transparentBackground: true } };
  }, [scene, cam, mathBackend]);

  const onLayout = fixedWidth ? undefined : (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };
  const aspect = (figure as { aspect?: number } | null)?.aspect ?? 1;
  const containerStyle: StyleProp<ViewStyle> = [fixedWidth ? { width: fixedWidth } : { alignSelf: 'stretch' }, style];

  if (!result) return <View style={[containerStyle, { aspectRatio: aspect }]} onLayout={onLayout} />;
  if (!result.ok || glError) {
    const errors = !result.ok ? result.errors : glError!;
    const d = describeOf(figure);
    return (
      <View style={containerStyle} onLayout={onLayout}>
        <FigureError errors={errors} theme={theme} {...(d ? { describe: d } : {})} {...(showErrorDetails !== undefined ? { showDetails: showErrorDetails } : {})} />
      </View>
    );
  }
  const s = result.scene;
  const overlayPrims = overlay && Number.isFinite(ms) ? frameAt(overlay, ms) : overlay?.primitives;
  return (
    <View style={containerStyle} onLayout={onLayout}>
      <View
        style={{ width: s.width, height: s.height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={s.describe}
        accessibilityHint={s.rotate ? 'Drag to rotate' : undefined}
        {...pan.panHandlers}
      >
        <GLView key={`${s.width}x${s.height}`} style={StyleSheet.absoluteFill} onContextCreate={(ctx) => onContextCreate(ctx as unknown as GLContext)} />
        {overlay ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <SceneSvg scene={overlay} {...(overlayPrims ? { primitives: overlayPrims } : {})} clipId={clipId} mathBackend={mathBackend} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
