import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, formatRate, formatSeconds } from '../sim/format';
import type { DerivedStats, PortState } from '../sim/types';
import { clockLabel, periodOf, timeOfDay } from './port/daylight';
import { theme } from './theme';

const PERIOD_ICON = { day: '☀', dawn: '☀', dusk: '☾', night: '☾' } as const;

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
export function Hud({ money, totalIncome, portLabel, portIndex, portCount, stats }: Props) {

  // The HUD re-renders with every sim tick, which is plenty for a clock.
  const tod = timeOfDay(Date.now());
  const period = periodOf(tod);

  return (
    <View style={styles.layer} pointerEvents="none">
      <View style={styles.topRow}>
        <View style={[styles.clock, period === 'night' || period === 'dusk' ? styles.clockNight : null]}>
          <Text style={[styles.clockIcon, period === 'night' || period === 'dusk' ? styles.clockIconNight : null]}>
            {PERIOD_ICON[period]}
          </Text>
          <Text style={[styles.clockText, period === 'night' || period === 'dusk' ? styles.clockTextNight : null]}>
            {clockLabel(tod)}
          </Text>
        </View>
      </View>

      <View style={styles.top}>
        <View style={styles.moneyPill}>
          <Text style={styles.money}>{formatMoney(money)}</Text>
          <Text style={styles.rate}>{formatRate(totalIncome)}</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.chip}>
          <Text style={styles.chipStrong}>{portLabel}</Text>
          <Text style={styles.chipDim}>
            {portIndex + 1}/{portCount}
          </Text>
        </View>

        <View style={styles.chip}>
          {/* The 3D berth runs at its own pace; this is the economy's. */}
          <Text style={[styles.chipStrong, { color: theme.good }]}>CARGO RUN</Text>
          <Text style={styles.chipDim}>every {formatSeconds(stats.cycleSeconds)}</Text>
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
  topRow: { position: 'absolute', top: 10, left: 10 },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.scrim,
    borderColor: theme.scrimEdge,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clockNight: { backgroundColor: 'rgba(20,32,92,0.88)', borderColor: 'rgba(180,200,255,0.35)' },
  clockIcon: { color: '#ff9f1c', fontSize: 15, fontWeight: '900' },
  clockIconNight: { color: '#ffe8a3' },
  clockText: { color: theme.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  clockTextNight: { color: '#e6ecff' },
  top: {
    alignItems: 'center',
    paddingTop: 8,
  },
  moneyPill: {
    alignItems: 'center',
    backgroundColor: theme.scrim,
    borderColor: theme.scrimEdge,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 6,
    shadowColor: '#0b3d6b',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  money: {
    color: '#ffb000',
    fontSize: 34,
    fontWeight: '900',
    textShadowColor: '#0b3d6b',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0.5,
  },
  rate: {
    color: theme.good,
    fontSize: 14,
    fontWeight: '800',
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
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  chipStrong: { color: theme.text, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  chipDim: { color: theme.textDim, fontSize: 10, marginTop: 1, fontWeight: '600' },
});
