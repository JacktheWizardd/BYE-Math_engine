import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Runs an animation clock. The default uses requestAnimationFrame (no
 * dependencies). Another driver (e.g. Reanimated) can be passed to ByeFigure.
 */
export interface AnimationDriver {
  /** Calls onFrame(ms since start) every frame until totalMs, then onEnd. Returns a stop function. */
  start(totalMs: number, onFrame: (ms: number) => void, onEnd: () => void): () => void;
}

export const rafDriver: AnimationDriver = {
  start(totalMs, onFrame, onEnd) {
    let id: number | null = null;
    let t0: number | null = null;
    const tick = (now: number) => {
      if (t0 === null) t0 = now;
      const ms = now - t0;
      if (ms >= totalMs) {
        id = null;
        onFrame(totalMs);
        onEnd();
        return;
      }
      onFrame(ms);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      if (id !== null) cancelAnimationFrame(id);
    };
  },
};

/** The system "Reduce Motion" setting; null until it's known. */
export function useReducedMotion(): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setValue(v))
      .catch(() => alive && setValue(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setValue(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return value;
}

export interface FigureClock {
  /** ms since the animation started (total when done). */
  ms: number;
  done: boolean;
  /** The figure has motion and the host wants it. */
  wantsMotion: boolean;
  /** Reduce Motion (prop override, else system; null while unknown). */
  reduce: boolean | null;
  playing: boolean;
}

/**
 * The animation clock shared by 2D and 3D figures: plays once when the figure
 * appears (or replayKey changes), never under Reduce Motion, and holds the first
 * frame while Reduce Motion is still unknown.
 */
export function useFigureClock(opts: {
  total: number;
  animate: boolean;
  reduceMotion: boolean | undefined;
  driver: AnimationDriver;
  /** Restart when any of these change. */
  restartKeys: unknown[];
  onEnd?: (() => void) | undefined;
}): FigureClock {
  const systemReduce = useReducedMotion();
  const reduce = opts.reduceMotion ?? systemReduce;
  const wantsMotion = opts.animate && opts.total > 0;
  const playing = wantsMotion && reduce === false;
  const [clock, setClock] = useState<{ ms: number; done: boolean }>({ ms: 0, done: false });
  const endRef = useRef(opts.onEnd);
  endRef.current = opts.onEnd;
  const { total, driver } = opts;
  // Layout effect: the reset to frame 0 lands before paint, so a replay never flashes the final state.
  useLayoutEffect(() => {
    if (!playing) return;
    setClock({ ms: 0, done: false });
    return driver.start(
      total,
      (ms) => setClock({ ms, done: false }),
      () => {
        setClock({ ms: total, done: true });
        endRef.current?.();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total, driver, ...opts.restartKeys]);
  return { ...clock, wantsMotion, reduce, playing };
}
