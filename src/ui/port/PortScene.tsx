import { StyleSheet, View } from 'react-native';
import Svg, { G, Text as SvgText } from 'react-native-svg';
import { formatMoney } from '../../sim/format';
import type { DerivedStats, GameState } from '../../sim/types';
import { Crane } from './Crane';
import { Quay } from './Quay';
import { Seascape } from './Seascape';
import { Ship } from './Ship';
import {
  SCENE,
  clamp01,
  containerRows,
  craneCount,
  easeInCubic,
  easeOutCubic,
  lerp,
  shipScale,
} from './geometry';
import { useSceneClock } from './useSceneClock';

/** How long the payout floats up for after a ship finishes. */
const PAYOUT_SECONDS = 1.4;

/** Hull length in local units, before scaling. Mirrors the path in Ship.tsx. */
const HULL_LENGTH = 124;

/** Fraction of the arrival phase the outgoing ship takes to clear the berth. */
const DEPART_SHARE = 0.45;

/**
 * How long the next ship holds off before entering, as a fraction of the
 * arrival phase. Without this the outgoing and incoming hulls slide through
 * each other mid-frame, which reads as one glitching ship rather than two.
 */
const ARRIVE_DELAY = 0.3;

interface Props {
  state: GameState;
  stats: DerivedStats;
}

/**
 * The port, drawn from the simulation rather than animated alongside it.
 *
 * Position within the berth cycle is recomputed from the save's own clock
 * (`berthCycleSeconds` as of `lastTickAt`, plus wall time since), so the scene
 * is smooth at frame rate while the sim keeps ticking at 10Hz — and the two
 * can never drift, because the scene holds no animation state of its own.
 */
export function PortScene({ state, stats }: Props) {
  const now = useSceneClock();
  const t = now / 1000;

  const { arrivalSeconds: arrival, unloadSeconds: unload, cycleSeconds: cycle } = stats;

  const elapsed = Math.max(0, (now - state.lastTickAt) / 1000);
  const pos = (((state.berthCycleSeconds + elapsed) % cycle) + cycle) % cycle;

  const arriving = pos < arrival;
  const arrivalP = arriving ? pos / arrival : 1;
  const unloadP = arriving ? 0 : clamp01((pos - arrival) / unload);

  const scale = shipScale(state.upgrades.shipSize);
  const rows = containerRows(state.upgrades.shipSize);
  const hullWidth = HULL_LENGTH * scale;

  // Incoming ship: holds off, sails in, then sits and unloads.
  const arriveP = clamp01((arrivalP - ARRIVE_DELAY) / (1 - ARRIVE_DELAY));
  const shipX = arriving ? lerp(-175, SCENE.berthX, easeOutCubic(arriveP)) : SCENE.berthX;
  const cargo = arriving ? 1 : 1 - unloadP;

  // Outgoing ship: the one just emptied, clearing the berth as the next arrives.
  const departP = clamp01(arrivalP / DEPART_SHARE);
  const showDeparting = arriving && departP < 1;
  const departX = lerp(SCENE.berthX, 400, easeInCubic(departP));

  const cranes = craneCount(state.upgrades.cranes);
  const craneSpeed = 0.5 + state.upgrades.cranes * 0.035;

  const showPayout = arriving && pos < PAYOUT_SECONDS;
  const payoutP = showPayout ? pos / PAYOUT_SECONDS : 0;

  return (
    <View style={styles.frame}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Seascape t={t} />

        {/* Cranes sit behind the hull so a moored ship reads as alongside, and
            spread along the berth the hull actually occupies — they run on
            quay rails, so they reposition as ships get bigger. */}
        <G>
          {Array.from({ length: cranes }, (_, i) => (
            <Crane
              key={i}
              x={SCENE.berthX + hullWidth * ((i + 0.5) / cranes)}
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
        />

        <Quay fill={unloadP} />

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
  frame: {
    width: '100%',
    aspectRatio: SCENE.width / SCENE.height,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0a1628',
  },
});
