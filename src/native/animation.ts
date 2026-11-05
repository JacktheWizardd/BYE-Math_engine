import { useEffect, useState } from 'react';
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
