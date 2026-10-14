import { Pressable, StyleSheet, Text, View } from 'react-native';
import { activeVip, vipReward } from '../sim/daily';
import { totalIncome } from '../sim/economy';
import { formatMoney, formatSeconds } from '../sim/format';
import { dailyRewardMultiplier } from '../sim/prestige';
import type { GameState } from '../sim/types';

/**
 * A VIP ship is in port: tap to welcome her aboard for a bonus. Visits are
 * short and come round every quarter of an hour, so it rewards checking in.
 */
export function VipBanner({ state, now, onWelcome }: { state: GameState; now: number; onWelcome: () => void }) {
  const vip = activeVip(state, now);
  if (!vip) return null;
  const reward = vipReward(totalIncome(state), dailyRewardMultiplier(state));
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onWelcome}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Welcome the VIP ship"
      >
        <Text style={styles.icon}>⛵</Text>
        <View style={styles.text}>
          <Text style={styles.title}>VIP tall ship in port!</Text>
          <Text style={styles.sub}>Leaves in {formatSeconds((vip.end - now) / 1000)}</Text>
        </View>
        <Text style={styles.cta}>Welcome +{formatMoney(reward.money)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 124, left: 0, right: 0, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#7c3aed',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#ffd23f',
    marginHorizontal: 16,
  },
  pressed: { opacity: 0.85 },
  icon: { fontSize: 20 },
  text: { flexShrink: 1 },
  title: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  sub: { color: '#e9d5ff', fontSize: 11, fontWeight: '700' },
  cta: {
    color: '#3b0764',
    backgroundColor: '#ffd23f',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
