import { StyleSheet, View } from 'react-native';
import Svg, { G, Text as SvgText } from 'react-native-svg';
import { formatMoney } from '../../sim/format';
import type { DerivedStats, PortState } from '../../sim/types';
import { Crane } from './Crane';
import { Quay } from './Quay';
import { Quayside, Tugs } from './Quayside';
import { Seascape } from './Seascape';
import { Ship } from './Ship';
import {
  SCENE,
  berthXFor,
  containerRows,
  craneCount,
  easeInCubic,
  easeOutCubic,
  lerp,
  shipScale,
} from './geometry';
import { berthMoment } from './timeline';
import { useSceneClock } from './useSceneClock';

interface Props {
  port: PortState;
  /** Index of this port, which selects its livery and tier. */
  portIndex: number;
  stats: DerivedStats;
  /** Epoch millis the port state is accurate as of. */
  lastTickAt: number;
}

/**
 * The flat SVG harbour. Used on native; the web build draws the 3D port
 * (PortView.web.tsx). Timing comes from `berthMoment`, shared by both.
 */
export function PortScene({ port, portIndex, stats, lastTickAt }: Props) {
  const now = useSceneClock();
  const t = now / 1000;

  const m = berthMoment(port, stats, lastTickAt, now);
  const { arriving, showDeparting, showPayout, payoutP, cargo } = m;

  const scale = shipScale(port.upgrades.shipSize);
  const rows = containerRows(port.upgrades.shipSize);
  const hullWidth = SCENE.hullLength * scale;
  const berthX = berthXFor(scale);

  // Incoming ship: holds off, sails in, then sits and unloads.
  const shipX = arriving ? lerp(-175, berthX, easeOutCubic(m.arriveP)) : berthX;

  // Outgoing ship: the one just emptied, clearing the berth as the next arrives.
  const departX = lerp(berthX, 400, easeInCubic(m.departP));

  const cranes = craneCount(port.upgrades.cranes);
  const craneSpeed = 0.5 + port.upgrades.cranes * 0.035;

  return (
    <View style={styles.frame}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Seascape t={t} port={portIndex} />

        {/* Structures the later upgrades buy, behind the cranes and the hull. */}
        <Quayside floodlights={port.upgrades.floodlights} customs={port.upgrades.customs} />

        {/* Cranes sit behind the hull so a moored ship reads as alongside, and
            spread along the berth the hull actually occupies — they run on
            quay rails, so they reposition as ships get bigger. */}
        <G>
          {Array.from({ length: cranes }, (_, i) => (
            <Crane
              key={i}
              x={berthX + hullWidth * ((i + 0.5) / cranes)}
              cycle={t * craneSpeed + i * 0.37}
              active={!arriving}
            />
          ))}
        </G>

        {showDeparting && (
          <Ship
            x={departX}
            y={SCENE.waterlineY}
            scale={scale}
            rows={rows}
            cargoFraction={0}
            bob={Math.sin(t * 1.7) * 0.9}
            moving
            port={portIndex}
          />
        )}

        {arriving && (
          <Tugs
            count={port.upgrades.tugboats}
            shipX={shipX}
            y={SCENE.waterlineY}
            bob={Math.sin(t * 2.1) * 1.2}
          />
        )}

        <Ship
          x={shipX}
          y={SCENE.waterlineY}
          scale={scale}
          rows={rows}
          cargoFraction={cargo}
          bob={Math.sin(t * 1.5 + 1.1) * (arriving ? 1.1 : 0.55)}
          moving={arriving}
          port={portIndex}
        />

        <Quay fill={m.unloadP} />

        {showPayout && (
          <G opacity={1 - payoutP}>
            <SvgText
              x={SCENE.width / 2}
              y={SCENE.quayY - 56 - 26 * payoutP}
              fontSize={13}
              fontWeight="bold"
              fill="none"
              stroke="#08111f"
              strokeWidth={3}
              textAnchor="middle"
            >
              {`+${formatMoney(stats.moneyPerShip)}`}
            </SvgText>
            <SvgText
              x={SCENE.width / 2}
              y={SCENE.quayY - 56 - 26 * payoutP}
              fontSize={13}
              fontWeight="bold"
              fill="#ffd166"
              textAnchor="middle"
            >
              {`+${formatMoney(stats.moneyPerShip)}`}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills whatever space the layout gives it; "slice" crops the sides rather
  // than letterboxing, which is why the berth is centred.
  frame: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#0a1628' },
});
