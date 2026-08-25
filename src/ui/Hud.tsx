import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, formatRate, formatSeconds } from '../sim/format';
import type { DerivedStats, PortState } from '../sim/types';
import { theme } from './theme';

interface Props {
  money: number;
  /** Income across every port, not just the one on screen. */
  totalIncome: number;
  portLabel: string;
  portIndex: number;
  portCount: number;
  port: PortState;
  stats: DerivedStats;
}

/**
 * Overlay on top of the scene: money, income, and what the berth is doing.
 * Sits over the art rather than beside it so the harbour stays the whole view.
 */
export function Hud({ money, totalIncome, portLabel, portIndex, portCount, port, stats }: Props) {
  const pos = port.berthCycleSeconds;
  const unloading = pos >= stats.arrivalSeconds;
  const remaining = unloading
    ? stats.arrivalSeconds + stats.unloadSeconds - pos
    : stats.arrivalSeconds - pos;

  return (
    <View style={styles.layer} pointerEvents="none">
      <View style={styles.top}>
        <Text style={styles.money}>{formatMoney(money)}</Text>
        <Text style={styles.rate}>{formatRate(totalIncome)}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.chip}>
          <Text style={styles.chipStrong}>{portLabel}</Text>
          <Text style={styles.chipDim}>
            {portIndex + 1}/{portCount}
          </Text>
        </View>

        <View style={styles.chip}>
          <Text style={[styles.chipStrong, { color: unloading ? theme.good : theme.accent }]}>
            {unloading ? 'UNLOADING' : 'INBOUND'}
          </Text>
          <Text style={styles.chipDim}>{formatSeconds(Math.max(0, remaining))}</Text>
        </View>

        <View style={styles.chip}>
          <Text style={styles.chipStrong}>{formatMoney(stats.moneyPerShip)}</Text>
          <Text style={styles.chipDim}>/ ship</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    // Money sits over the cranes, so it needs its own ground to read against.
    backgroundColor: theme.scrim,
  },
  money: {
    color: theme.money,
    fontSize: 38,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  rate: {
    color: theme.good,
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    gap: 6,
  },
  chip: {
    backgroundColor: theme.scrim,
    borderColor: theme.scrimEdge,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  chipStrong: { color: theme.text, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  chipDim: { color: theme.textDim, fontSize: 10, marginTop: 1 },
});
