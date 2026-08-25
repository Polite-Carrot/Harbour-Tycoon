import { memo } from 'react';
import { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SCENE } from './geometry';

/**
 * The structures the later upgrades buy: floodlight masts and the customs
 * house. Drawn behind the ship, standing on the quay, so buying them visibly
 * changes the harbour rather than just moving a number.
 */
export const Quayside = memo(function Quayside({
  floodlights,
  customs,
}: {
  floodlights: number;
  customs: number;
}) {
  const { quayY } = SCENE;

  // One mast per five levels, up to four. Enough to read as "the port got
  // brighter" without turning the sky into a light show.
  const masts = Math.min(4, Math.ceil(floodlights / 5));
  // Kept inside roughly x 60-260: the scene is rendered with "slice", so the
  // outer edges get cropped away on tall screens and anything out there is
  // simply never seen.
  const mastXs = [72, 128, 184, 240].slice(0, masts);

  return (
    <G>
      <Defs>
        <RadialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#ffe9b0" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#ffe9b0" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {customs > 0 && (
        <G>
          {/* Customs house: a shed on the quay with a lit window band. */}
          <Rect x={196} y={quayY - 30} width={54} height={30} rx={2} fill="#33404f" />
          <Path d={`M192,${quayY - 30} L223,${quayY - 42} L254,${quayY - 30} Z`} fill="#3f4e60" />
          <Rect x={202} y={quayY - 22} width={42} height={8} rx={1} fill="#ffd166" opacity={0.75} />
          <Rect x={218} y={quayY - 12} width={10} height={12} rx={1} fill="#1b2430" />
        </G>
      )}

      {mastXs.map((x) => (
        <G key={x}>
          <Circle cx={x} cy={quayY - 54} r={26} fill="url(#lamp)" />
          <Line x1={x} y1={quayY} x2={x} y2={quayY - 50} stroke="#8895a6" strokeWidth={2} />
          <Rect x={x - 7} y={quayY - 56} width={14} height={5} rx={1} fill="#c8d3de" />
          <Rect x={x - 5} y={quayY - 51} width={10} height={2} fill="#ffe9b0" />
        </G>
      ))}
    </G>
  );
});

/**
 * Tugboats escorting an arriving ship. They only appear while a ship is under
 * way, which is exactly when the upgrade is doing something.
 */
export const Tugs = memo(function Tugs({
  count,
  shipX,
  y,
  bob,
}: {
  count: number;
  shipX: number;
  y: number;
  bob: number;
}) {
  if (count <= 0) return null;

  // One tug per six levels, up to two — a big ship gets a bow and a stern tug.
  const tugs = Math.min(2, Math.ceil(count / 6));
  const offsets = [-26, 150].slice(0, tugs);

  return (
    <G>
      {offsets.map((dx, i) => (
        <G key={dx} x={shipX + dx} y={y + bob + Math.sin(i * 1.7) * 0.6}>
          <Path d="M0,0 L1,-6 L17,-6 L20,0 L18,2 L2,2 Z" fill="#2f4256" />
          <Rect x={5} y={-11} width={7} height={5} rx={1} fill="#e6ecf2" />
          <Rect x={13} y={-12} width={3} height={6} rx={1} fill="#c1666b" />
          <Path d="M20,1 q7,-2 12,1 q-6,2 -12,-1 Z" fill="#cfe6f5" opacity={0.45} />
        </G>
      ))}
    </G>
  );
});
