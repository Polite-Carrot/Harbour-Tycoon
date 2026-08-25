import { memo } from 'react';
import { G, Line, Path, Rect } from 'react-native-svg';
import { SCENE, lerp, pingPong } from './geometry';

const BOOM_LEFT = -52;
const BOOM_RIGHT = 32;

interface Props {
  /** Centre of the crane's portal on the quay. */
  x: number;
  /** 0 while idle, otherwise drives the trolley and hoist. */
  cycle: number;
  active: boolean;
}

/**
 * A ship-to-shore gantry crane. The trolley shuttles along the boom and the
 * hoist rises and falls a quarter-cycle behind it, which reads as picking a
 * box off the deck and carrying it ashore.
 */
export const Crane = memo(function Crane({ x, cycle, active }: Props) {
  const { quayY, gantryY } = SCENE;

  const travel = active ? pingPong(cycle) : 0.12;
  const trolleyX = lerp(BOOM_LEFT + 6, BOOM_RIGHT - 6, travel);

  // Hoist is lowest when the trolley is at either end, highest mid-traverse.
  const hoistPhase = active ? Math.abs(Math.sin(cycle * Math.PI)) : 0.15;
  const hookY = gantryY + lerp(52, 14, hoistPhase);
  const carrying = active && travel > 0.15 && travel < 0.85;

  const legTop = gantryY + 4;

  return (
    <G>
      {/* Portal legs and sill beam. */}
      <Line x1={x - 13} y1={legTop} x2={x - 17} y2={quayY} stroke="#d8dee6" strokeWidth={2.4} />
      <Line x1={x + 13} y1={legTop} x2={x + 17} y2={quayY} stroke="#d8dee6" strokeWidth={2.4} />
      <Line x1={x - 13} y1={legTop} x2={x + 13} y2={legTop} stroke="#c3ccd6" strokeWidth={2} />
      <Line x1={x - 15} y1={quayY - 14} x2={x + 15} y2={quayY - 14} stroke="#aab6c2" strokeWidth={1.4} />

      {/* Boom, with the landward backreach counterweighted. */}
      <Rect x={x + BOOM_LEFT} y={gantryY - 2} width={BOOM_RIGHT - BOOM_LEFT} height={4} rx={1} fill="#e8eef4" />
      <Path
        d={`M${x + BOOM_LEFT},${gantryY - 2} L${x - 10},${gantryY - 16} L${x + 10},${gantryY - 16} L${x + BOOM_RIGHT},${gantryY - 2} Z`}
        fill="none"
        stroke="#9fb0c0"
        strokeWidth={1.2}
      />
      <Rect x={x + 6} y={gantryY - 22} width={14} height={8} rx={1} fill="#7f8fa0" />

      {/* Machinery house. */}
      <Rect x={x - 8} y={gantryY - 12} width={14} height={10} rx={1} fill="#dbe3ea" />

      {/* Trolley, hoist ropes and spreader. */}
      <Rect x={x + trolleyX - 4} y={gantryY - 5} width={8} height={5} rx={1} fill="#ffd166" />
      <Line x1={x + trolleyX - 2} y1={gantryY} x2={x + trolleyX - 2} y2={hookY} stroke="#c9d4de" strokeWidth={0.7} />
      <Line x1={x + trolleyX + 2} y1={gantryY} x2={x + trolleyX + 2} y2={hookY} stroke="#c9d4de" strokeWidth={0.7} />
      <Rect x={x + trolleyX - 7} y={hookY} width={14} height={2.6} rx={0.8} fill="#ffd166" />
      {carrying && (
        <Rect x={x + trolleyX - 6} y={hookY + 2.6} width={12} height={5.4} rx={0.6} fill="#4c9f70" />
      )}
    </G>
  );
});
