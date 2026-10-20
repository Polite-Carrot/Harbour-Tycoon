import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { formatMoney, formatCount } from '../sim/format';
import { anchorsFor } from '../sim/empire';
import { PERKS, earningsForStars, hasPerk, incomeMultiplier, nextPerk, starsFor, starsForSale } from '../sim/prestige';
import type { GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  visible: boolean;
  state: GameState;
  onSell: () => void;
  /** Open the Shipping Empire screen. */
  onEmpire: () => void;
  onClose: () => void;
}

/**
 * Head Office: Reputation, what selling the company would be worth right
 * now, and the perk ladder. Selling is guarded by a confirmation screen that
 * spells out exactly what is kept and what is lost.
 */
export function HeadOfficeModal({ visible, state, onSell, onEmpire, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);
  if (!visible) return null;

  const stars = state.prestige.stars;
  // The bar and next-star target follow the run's base worth; the Reputation
  // Agency multiplies what a sale actually pays.
  const base = starsFor(state.runEarnings);
  const pending = starsForSale(state);
  const anchors = anchorsFor(state);
  const bonus = (incomeMultiplier(state) - 1) * 100;
  const after = { ...state, prestige: { ...state.prestige, stars: stars + pending } };
  const bonusAfter = (incomeMultiplier(after) - 1) * 100;
  const nextAt = earningsForStars(base + 1);
  const prevAt = base > 0 ? earningsForStars(base) : 0;
  // Progress toward the next star, on a log scale — earnings grow by orders
  // of magnitude, so a linear bar would sit at zero and then jump.
  const progress =
    state.runEarnings <= 0
      ? 0
      : base === 0
        ? Math.min(1, Math.max(0, Math.log10(Math.max(1, state.runEarnings)) / Math.log10(BALANCE.prestige.minEarnings)))
        : Math.min(1, Math.max(0, (Math.log10(state.runEarnings) - Math.log10(prevAt)) / (Math.log10(nextAt) - Math.log10(prevAt))));
  const upcoming = nextPerk(state);
  const unlocksNow = PERKS.filter((p) => stars < p.stars && stars + pending >= p.stars);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {confirming ? (
            <>
              <Text style={styles.title}>Sell the company?</Text>
              <Text style={styles.lede}>
                You start a new run with one empty port, and a bigger reputation behind you.
              </Text>
              <View style={styles.box}>
                <Text style={styles.boxTitle}>You keep</Text>
                <Text style={styles.keep}>⭐ {formatCount(stars + pending)} stars (+{formatCount(pending)})</Text>
                <Text style={styles.keep}>Income bonus +{formatCount(bonusAfter)}% for good</Text>
                {unlocksNow.map((p) => (
                  <Text key={p.id} style={styles.keep}>
                    Unlocks {p.name}
                  </Text>
                ))}
                <Text style={styles.keep}>Daily streak, contracts and lifetime stats</Text>
              </View>
              <View style={styles.box}>
                <Text style={styles.boxTitle}>You give up</Text>
                <Text style={styles.lose}>{formatMoney(state.money)} in the bank</Text>
                <Text style={styles.lose}>
                  {state.ports.length} {state.ports.length === 1 ? 'port' : 'ports'} and every upgrade on them
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => {
                  setConfirming(false);
                  onSell();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Sell for ⭐ {formatCount(pending)}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setConfirming(false)} accessibilityRole="button">
                <Text style={styles.secondaryText}>Not yet</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Head Office</Text>
              <View style={styles.hero}>
                <Text style={styles.heroStars}>⭐ {formatCount(stars)}</Text>
                <Text style={styles.heroLabel}>Reputation · +{formatCount(bonus)}% income on every port</Text>
              </View>

              <View style={styles.box}>
                <View style={styles.row}>
                  <Text style={styles.label}>Earned this run</Text>
                  <Text style={styles.value}>{formatMoney(state.runEarnings)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Selling now is worth</Text>
                  <Text style={[styles.value, styles.gold]}>⭐ {formatCount(pending)}</Text>
                </View>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.hint}>
                  {base === 0
                    ? `Earn ${formatMoney(BALANCE.prestige.minEarnings)} in a run for your first star`
                    : `Next star at ${formatMoney(nextAt)} earned`}
                </Text>
              </View>

              <Pressable
                disabled={pending === 0}
                style={({ pressed }) => [styles.primary, pending === 0 && styles.disabled, pressed && styles.pressed]}
                onPress={() => setConfirming(true)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{pending === 0 ? 'Not worth selling yet' : 'Sell the company…'}</Text>
              </Pressable>

              <Text style={styles.section}>Perks</Text>
              <ScrollView style={styles.perkScroll} contentContainerStyle={styles.perks}>
                {PERKS.map((p) => {
                  const owned = hasPerk(state, p.id);
                  const next = upcoming?.id === p.id;
                  return (
                    <View key={p.id} style={[styles.perk, owned && styles.perkOwned, next && styles.perkNext]}>
                      <Text style={styles.perkIcon}>{owned ? '✓' : '🔒'}</Text>
                      <View style={styles.perkText}>
                        <Text style={[styles.perkName, !owned && styles.dim]}>{p.name}</Text>
                        <Text style={styles.perkBlurb}>{p.blurb}</Text>
                      </View>
                      <Text style={[styles.perkStars, owned && styles.gold]}>⭐ {formatCount(p.stars)}</Text>
                    </View>
                  );
                })}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [styles.empire, pressed && styles.pressed]}
                onPress={onEmpire}
                accessibilityRole="button"
                accessibilityLabel="Shipping Empire"
              >
                <Text style={styles.empireTitle}>⚓ Shipping Empire</Text>
                <Text style={styles.empireSub}>
                  {anchors > 0
                    ? `Found one now for ⚓ ${formatCount(anchors)}`
                    : state.empire.founded > 0 || state.empire.anchors > 0
                      ? `⚓ ${formatCount(state.empire.anchors)} Anchors · Legacy upgrades`
                      : `Unlocks at ⭐ ${formatCount(BALANCE.empire.minStars)}`}
                </Text>
              </Pressable>

              <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
                <Text style={styles.secondaryText}>Close</Text>
              </Pressable>
            </>
          )}
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
    gap: 9,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  lede: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  hero: { alignItems: 'center', backgroundColor: '#0b3d6b', borderRadius: 12, paddingVertical: 12, gap: 2 },
  heroStars: { color: '#ffd23f', fontSize: 30, fontWeight: '900' },
  heroLabel: { color: '#dbeafe', fontSize: 12, fontWeight: '700' },
  box: { backgroundColor: theme.bg, borderRadius: 10, padding: 11, gap: 6 },
  boxTitle: { color: theme.text, fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  keep: { color: theme.good, fontSize: 13, fontWeight: '700' },
  lose: { color: '#c0392b', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: theme.textDim, fontSize: 13 },
  value: { color: theme.text, fontSize: 14, fontWeight: '800' },
  gold: { color: theme.moneyText },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: theme.money },
  hint: { color: theme.textDim, fontSize: 11 },
  primary: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: theme.onAccent, fontSize: 15, fontWeight: '900' },
  disabled: { backgroundColor: theme.disabled },
  pressed: { opacity: 0.85 },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
  section: { color: theme.text, fontSize: 13, fontWeight: '900', marginTop: 2 },
  perkScroll: { maxHeight: 230 },
  perks: { gap: 6 },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 9,
    backgroundColor: theme.panel,
  },
  perkOwned: { backgroundColor: '#ecfdf3', borderColor: '#9fdcb5' },
  perkNext: { borderColor: theme.accent, borderWidth: 2 },
  perkIcon: { fontSize: 15, width: 20, textAlign: 'center', color: theme.good },
  perkText: { flex: 1, gap: 1 },
  perkName: { color: theme.text, fontSize: 13, fontWeight: '800' },
  perkBlurb: { color: theme.textDim, fontSize: 11 },
  perkStars: { color: theme.textDim, fontSize: 12, fontWeight: '800' },
  dim: { color: theme.textDim },
  empire: { backgroundColor: '#3b1f5c', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center', gap: 1 },
  empireTitle: { color: '#ffd23f', fontSize: 14, fontWeight: '900' },
  empireSub: { color: '#e9ddff', fontSize: 11, fontWeight: '700' },
});
