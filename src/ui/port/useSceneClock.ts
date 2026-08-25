import { useEffect, useRef, useState } from 'react';

/** Cap the redraw rate. The scene is simple, but phones are not all fast. */
const FRAME_MS = 1000 / 45;

/**
 * A clock that ticks every animation frame.
 *
 * The simulation deliberately runs at a slow display cadence (10Hz), which
 * would make ships visibly stutter. Rather than speed the sim up, the scene
 * keeps its own frame clock and derives motion from elapsed wall time. The sim
 * stays the single source of truth for money; this only affects pixels.
 */
export function useSceneClock(): number {
  const [now, setNow] = useState(() => Date.now());
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = Date.now();
      if (t - last.current >= FRAME_MS) {
        last.current = t;
        setNow(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return now;
}
