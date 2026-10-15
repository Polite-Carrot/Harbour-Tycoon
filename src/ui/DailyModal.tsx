import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { canClaimLogin, contractReward, loginReward, loginTier } from '../sim/daily';
import { totalIncome } from '../sim/economy';
import { formatDuration, formatMoney, formatCount } from '../sim/format';
import { dailyRewardMultiplier } from '../sim/prestige';
import type { Contract, GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  visible: boolean;
  state: GameState;
  day: number;
  onClaimLogin: () => void;
  onClaimContract: (index: number) => void;
  onClose: () => void;
}

/** How many daily things are waiting to be claimed — the toolbar badge. */
export function dailyBadge(state: GameState, day: number): number {
  const login = canClaimLogin(state.daily, day) ? 1 : 0;
  const done = state.daily.contracts.filter((c) => !c.claimed && c.progress >= c.target).length;
  return login + done;
}

const describe = (c: Contract) =>
  c.kind === 'ships'
    ? `Handle ${formatCount(c.target)} ships`
    : c.kind === 'upgrades'
      ? `Buy ${formatCount(c.target)} upgrade levels`
      : `Earn ${formatMoney(c.target)}`;

const progressText = (c: Contract) => (c.kind === 'earn' ? formatMoney(c.progress) : formatCount(Math.floor(c.progress)));

/** Seconds until local midnight, when the contracts refresh. */
function untilMidnight(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, (next.getTime() - now.getTime()) / 1000);
}

/**
 * The daily screen: a seven-day login ladder (stars on day seven) and three
 * contracts sized to the player's current port, refreshed at local midnight.
 */
export function DailyModal({ visible, state, day, onClaimLogin, onClaimContract, onClose }: Props) {
  if (!visible) return null;
  const income = totalIncome(state);
  const mult = dailyRewardMultiplier(state);
  const canLogin = canClaimLogin(state.daily, day);
  const tierNext = loginTier(state.daily, day);
  // Days already ticked off in this week of the ladder.
  const filled = canLogin ? tierNext - 1 : ((state.daily.streak - 1) % 7) + 1;
  const reward = loginReward(state.daily, day, income, mult);
  const boostLeft = Math.max(0, (state.boostUntil - Date.now()) / 1000);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Daily</Text>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.section}>Login streak · day {canLogin ? tierNext : filled} of 7</Text>
            <View style={styles.ladder}>
              {BALANCE.daily.loginMinutes.map((m, i) => {
                const done = i < filled;
                const next = canLogin && i === tierNext - 1;
                return (
                  <View key={i} style={[styles.rung, done && styles.rungDone, next && styles.rungNext]}>
                    <Text style={[styles.rungDay, done && styles.rungTextDone]}>Day {i + 1}</Text>
                    <Text style={[styles.rungReward, done && styles.rungTextDone]}>{i === 6 ? `⭐${BALANCE.daily.weeklyStars}` : `${m}m`}</Text>
                    {done && <Text style={styles.tick}>✓</Text>}
                  </View>
                );
              })}
            </View>
            <Pressable
              disabled={!canLogin}
              onPress={onClaimLogin}
              style={({ pressed }) => [styles.claim, !canLogin && styles.claimOff, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.claimText}>
                {canLogin
                  ? `Claim ${formatMoney(reward.money)}${reward.stars ? ` + ⭐${reward.stars}` : ''}`
                  : `Come back in ${formatDuration(untilMidnight())}`}
              </Text>
            </Pressable>
            <Text style={styles.hint}>Rewards are minutes of your income. Miss a day and the streak starts over.</Text>

            <Text style={styles.section}>Today's contracts</Text>
            {state.daily.contracts.map((c, i) => {
              const done = c.progress >= c.target;
              const r = contractReward(c, income, mult);
              return (
                <View key={i} style={[styles.contract, c.claimed && styles.contractClaimed]}>
                  <View style={styles.contractHead}>
                    <Text style={styles.contractName}>{describe(c)}</Text>
                    <Text style={styles.contractReward}>
                      +{formatMoney(r.money)}
                      {r.boostSeconds ? ` · 2× ${formatDuration(r.boostSeconds)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.min(100, (c.progress / c.target) * 100)}%` }, done && styles.barDone]} />
                  </View>
                  <View style={styles.contractFoot}>
                    <Text style={styles.hint}>
                      {progressText(c)} / {c.kind === 'earn' ? formatMoney(c.target) : formatCount(c.target)}
                    </Text>
                    {c.claimed ? (
                      <Text style={styles.claimed}>Claimed ✓</Text>
                    ) : (
                      <Pressable
                        disabled={!done}
                        onPress={() => onClaimContract(i)}
                        style={({ pressed }) => [styles.smallClaim, !done && styles.claimOff, pressed && styles.pressed]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.smallClaimText}>{done ? 'Claim' : 'In progress'}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
            {boostLeft > 0 && <Text style={styles.boost}>⚡ Double income for another {formatDuration(boostLeft)}</Text>}
            <Text style={styles.hint}>New contracts in {formatDuration(untilMidnight())}. Watch out for VIP ships, too.</Text>
          </ScrollView>
          <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
            <Text style={styles.secondaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,61,107,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    width: '100%',
    maxWidth: 400,
    maxHeight: '94%',
    gap: 6,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  body: { gap: 8, paddingBottom: 4 },
  section: { color: theme.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  ladder: { flexDirection: 'row', gap: 4 },
  rung: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 6,
    backgroundColor: theme.bg,
  },
  rungDone: { backgroundColor: theme.good, borderColor: theme.good },
  rungNext: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.panelAlt },
  rungDay: { color: theme.textDim, fontSize: 9, fontWeight: '800' },
  rungReward: { color: theme.text, fontSize: 11, fontWeight: '900' },
  rungTextDone: { color: '#ffffff' },
  tick: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  claim: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  claimOff: { backgroundColor: theme.disabled },
  claimText: { color: theme.onAccent, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.85 },
  hint: { color: theme.textDim, fontSize: 11 },
  contract: { borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 10, gap: 6, backgroundColor: theme.panel },
  contractClaimed: { opacity: 0.55 },
  contractHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  contractName: { color: theme.text, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  contractReward: { color: theme.moneyText, fontSize: 12, fontWeight: '800' },
  contractFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: theme.accent },
  barDone: { backgroundColor: theme.good },
  smallClaim: { backgroundColor: theme.good, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  smallClaimText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  claimed: { color: theme.good, fontSize: 12, fontWeight: '900' },
  boost: { color: theme.accent, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
});
