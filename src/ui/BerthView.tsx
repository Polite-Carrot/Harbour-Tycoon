import { StyleSheet, Text, View } from 'react-native';
import type { DerivedStats, GameState } from '../sim/types';
import { formatMoney, formatSeconds } from '../sim/format';
import { theme } from './theme';

/** The one berth: shows which phase of the cycle it is in and how far along. */
export function BerthView({ state, stats }: { state: GameState; stats: DerivedStats }) {
  const pos = state.berthCycleSeconds;
  const unloading = pos >= stats.arrivalSeconds;

  const progress = unloading
    ? (pos - stats.arrivalSeconds) / stats.unloadSeconds
    : pos / stats.arrivalSeconds;

  const remaining = unloading
    ? stats.arrivalSeconds + stats.unloadSeconds - pos
    : stats.arrivalSeconds - pos;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Berth 1</Text>
        <Text style={[styles.phase, { color: unloading ? theme.good : theme.textDim }]}>
          {unloading ? 'UNLOADING' : 'SHIP INBOUND'}
        </Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
              backgroundColor: unloading ? theme.good : theme.accent,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.dim}>{formatSeconds(remaining)} left</Text>
        <Text style={styles.dim}>
          {formatMoney(stats.cargoPerShip)} cargo · {formatMoney(stats.moneyPerShip)} / ship
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  phase: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  track: {
    height: 14,
    backgroundColor: theme.bg,
    borderRadius: 7,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  dim: { color: theme.textDim, fontSize: 12 },
});
