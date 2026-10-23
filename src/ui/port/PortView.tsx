import type { DerivedStats, PortState } from '../../sim/types';
import { PortScene } from './PortScene';

export interface PortViewProps {
  port: PortState;
  /** Index of this port, which selects its livery and tier. */
  portIndex: number;
  stats: DerivedStats;
  /** Epoch millis the port state is accurate as of. */
  lastTickAt: number;
  /** When a Time Warp started (performance.now() ms), to play its time-lapse. 3D only. */
  warpStartedAt?: number;
  /** Harbour event last collected, so a fished-out container leaves the water. 3D only. */
  lastEventSlot?: number;
}

/**
 * The harbour view's props, and the flat SVG harbour. The web build resolves
 * PortView.web.tsx and the apps PortView.native.tsx, which both draw the
 * explorable 3D port; this flat version is what they fall back to when the
 * device can't do 3D (and what tests render).
 */
export function PortView({ warpStartedAt: _warp, lastEventSlot: _event, ...props }: PortViewProps) {
  return <PortScene {...props} />;
}
