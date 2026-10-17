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
 * The harbour view. Native draws the flat SVG scene; the web build resolves
 * PortView.web.tsx instead and draws the explorable 3D port.
 */
export function PortView({ warpStartedAt: _warp, lastEventSlot: _event, ...props }: PortViewProps) {
  return <PortScene {...props} />;
}
