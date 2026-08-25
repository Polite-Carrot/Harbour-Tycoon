import { memo } from 'react';
import { G, Path, Rect } from 'react-native-svg';
import { containerColour } from './geometry';

const COLS = 6;
const BOX_W = 12;
const BOX_H = 6;
const DECK_Y = -16;
const BOX_X0 = 32;

interface Props {
  /** Left edge of the hull, in scene coordinates. */
  x: number;
  /** Waterline the hull sits on. */
  y: number;
  scale: number;
  rows: number;
  /** 1 = fully laden, 0 = empty. Drives how many boxes are drawn. */
  cargoFraction: number;
  /** Gentle vertical bob, in scene units. */
  bob: number;
  /** Draws a bow wave when the ship is under way. */
  moving: boolean;
}

/**
 * A container ship, drawn bow-right. Local coordinates put the waterline at
 * y = 0 and the stern at x = 0, so callers only deal with position and scale.
 */
export const Ship = memo(function Ship({ x, y, scale, rows, cargoFraction, bob, moving }: Props) {
  const total = COLS * rows;
  const shown = Math.round(total * Math.max(0, Math.min(1, cargoFraction)));

  const boxes = [];
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    boxes.push(
      <Rect
        key={i}
        x={BOX_X0 + col * BOX_W}
        y={DECK_Y - (row + 1) * BOX_H}
        width={BOX_W - 1}
        height={BOX_H - 1}
        rx={0.6}
        fill={containerColour(row * 2 + col)}
        opacity={0.95}
      />,
    );
  }

  return (
    <G x={x} y={y + bob} scale={scale}>
      {/* Bow wave and wake, only while making way. */}
      {moving && (
        <>
          <Path d="M118,2 q10,-3 18,1 q-9,3 -18,-1 Z" fill="#cfe6f5" opacity={0.5} />
          <Path d="M2,2 q-22,2 -40,-1 q20,-4 40,1 Z" fill="#cfe6f5" opacity={0.28} />
        </>
      )}

      {/* Hull, bow tapering to the right. */}
      <Path d="M0,-16 L104,-16 L124,-7 L117,3 L3,3 Z" fill="#8c2f39" />
      {/* Boot topping at the waterline. */}
      <Path d="M3,-1 L118,-1 L117,3 L3,3 Z" fill="#40161c" opacity={0.9} />
      {/* Deck line. */}
      <Rect x={0} y={-17} width={124} height={1.6} fill="#d9c9a3" opacity={0.75} />

      {boxes}

      {/* Superstructure and funnel at the stern. */}
      <Rect x={4} y={-36} width={24} height={20} rx={1} fill="#e6ecf2" />
      <Rect x={7} y={-33} width={4} height={3} fill="#2b3a4a" />
      <Rect x={13} y={-33} width={4} height={3} fill="#2b3a4a" />
      <Rect x={19} y={-33} width={4} height={3} fill="#2b3a4a" />
      <Rect x={7} y={-27} width={4} height={3} fill="#2b3a4a" />
      <Rect x={13} y={-27} width={4} height={3} fill="#2b3a4a" />
      <Rect x={19} y={-27} width={4} height={3} fill="#2b3a4a" />
      <Rect x={12} y={-45} width={8} height={9} rx={1} fill="#2f4256" />
      <Rect x={12} y={-45} width={8} height={2.5} fill="#c1666b" />
    </G>
  );
});
