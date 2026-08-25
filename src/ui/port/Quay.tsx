import { memo } from 'react';
import { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SCENE, containerColour } from './geometry';

/** Yard grid. Two rows of boxes sitting on the apron. */
const YARD_X0 = 10;
const YARD_COLS = 14;
const BOX_W = 21;
const BOX_H = 11;
const ROW_Y = [SCENE.quayY + 20, SCENE.quayY + 7];
const BASE_STOCK = 11;

interface Props {
  /** 0..1 through the current unload, drives how full the yard is. */
  fill: number;
}

/**
 * The dock apron in the foreground: quay edge, bollards and the container
 * yard. The yard fills as cargo comes ashore and resets each cycle, once the
 * boxes have notionally been trucked away.
 */
export const Quay = memo(function Quay({ fill }: Props) {
  const { width, height, quayY } = SCENE;

  const capacity = YARD_COLS * ROW_Y.length;
  const shown = Math.min(capacity, BASE_STOCK + Math.round((capacity - BASE_STOCK) * fill));

  const boxes = [];
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / YARD_COLS);
    const col = i % YARD_COLS;
    if (row >= ROW_Y.length) break;
    boxes.push(
      <G key={i}>
        <Rect
          x={YARD_X0 + col * BOX_W}
          y={ROW_Y[row]}
          width={BOX_W - 3}
          height={BOX_H}
          rx={0.8}
          fill={containerColour(i + row)}
        />
        {/* Top face, to read as a stack rather than a flat sticker. */}
        <Rect
          x={YARD_X0 + col * BOX_W}
          y={ROW_Y[row]}
          width={BOX_W - 3}
          height={2.4}
          rx={0.8}
          fill="#ffffff"
          opacity={0.22}
        />
      </G>,
    );
  }

  return (
    <G>
      <Defs>
        <LinearGradient id="apron" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3d4756" />
          <Stop offset="1" stopColor="#232b36" />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={quayY} width={width} height={height - quayY} fill="url(#apron)" />
      {/* Quay coping, lit from the water side. */}
      <Rect x={0} y={quayY} width={width} height={2.4} fill="#66748a" />
      <Rect x={0} y={quayY + 2.4} width={width} height={1} fill="#151b24" opacity={0.6} />

      {/* Bollards along the edge. */}
      {[26, 78, 130, 182, 234, 286].map((bx) => (
        <G key={bx}>
          <Rect x={bx} y={quayY - 4} width={5} height={4} rx={1.6} fill="#8c98a8" />
          <Circle cx={bx + 2.5} cy={quayY - 4.4} r={2.6} fill="#9aa6b6" />
        </G>
      ))}

      {boxes}
    </G>
  );
});
