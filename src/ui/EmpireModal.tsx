import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type LegacyId } from '../config/balance';
import { LEGACY_ORDER, anchorsFor, describeLegacy, legacyCost, legacyLevel } from '../sim/empire';
import { formatCount, formatMoney } from '../sim/format';
import type { GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  visible: boolean;
  state: GameState;
  onFound: () => void;
  onBuy: (id: LegacyId) => void;
  onClose: () => void;
}

/**
 * The Shipping Empire: trade every Reputation star for Anchors, and spend
 * Anchors on Legacy upgrades that are never lost. Founding is guarded by a
 * confirmation screen that spells out what goes, since it costs the perks.
 */
export function EmpireModal({ visible, state, onFound, onBuy, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);
  if (!visible) return null;

  const { minStars, starsPerAnchor } = BALANCE.empire;
  const stars = state.prestige.stars;
  const worth = anchorsFor(state);
  const progress = Math.min(1, stars / minStars);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {confirming ? (
            <>
              <Text style={styles.title}>Found a Shipping Empire?</Text>
              <Text style={styles.lede}>Your reputation becomes a dynasty. You start again from one empty port.</Text>
              <View style={styles.box}>
                <Text style={styles.boxTitle}>You get</Text>
                <Text style={styles.keep}>⚓ {formatCount(worth)} Anchors for Legacy upgrades</Text>
                <Text style={styles.keep}>Legacy upgrades, research, daily streak and lifetime stats</Text>
              </View>
              <View style={styles.box}>
                <Text style={styles.boxTitle}>You give up</Text>
                <Text style={styles.lose}>All ⭐ {formatCount(stars)} stars, and every perk they unlocked</Text>
                <Text style={styles.lose}>
                  {formatMoney(state.money)}, {state.ports.length} {state.ports.length === 1 ? 'port' : 'ports'} and your managers
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => {
                  setConfirming(false);
                  onFound();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Found it for ⚓ {formatCount(worth)}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setConfirming(false)} accessibilityRole="button">
                <Text style={styles.secondaryText}>Not yet</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Shipping Empire</Text>
              <View style={styles.hero}>
                <Text style={styles.heroAnchors}>⚓ {formatCount(state.empire.anchors)}</Text>
                <Text style={styles.heroLabel}>
                  Anchors to spend · {state.empire.founded === 0 ? 'no Empire founded yet' : `${formatCount(state.empire.founded)} founded`}
                </Text>
              </View>

              <View style={styles.box}>
                {worth > 0 ? (
                  <Text style={styles.value}>
                    Founding now is worth <Text style={styles.gold}>⚓ {formatCount(worth)}</Text>
                  </Text>
                ) : (
                  <>
                    <Text style={styles.value}>Unlocks at ⭐ {formatCount(minStars)} Reputation</Text>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                  </>
                )}
                <Text style={styles.hint}>One Anchor for every {starsPerAnchor} stars. Founding an Empire gives up every star.</Text>
              </View>

              <Pressable
                disabled={worth === 0}
                style={({ pressed }) => [styles.primary, worth === 0 && styles.disabled, pressed && styles.pressed]}
                onPress={() => setConfirming(true)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{worth === 0 ? `⭐ ${formatCount(stars)} / ${formatCount(minStars)}` : 'Found an Empire…'}</Text>
              </Pressable>

              <Text style={styles.section}>Legacy upgrades</Text>
              <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
                {LEGACY_ORDER.map((id) => {
                  const l = BALANCE.empire.legacy[id];
                  const level = legacyLevel(state, id);
                  const cost = legacyCost(id, level);
                  const maxed = !Number.isFinite(cost);
                  const afford = !maxed && state.empire.anchors >= cost;
                  return (
                    <View key={id} style={styles.row}>
                      <Text style={styles.icon}>{l.icon}</Text>
                      <View style={styles.info}>
                        <Text style={styles.name}>
                          {l.name} <Text style={styles.level}>· Lv {level}/{l.maxLevel}</Text>
                        </Text>
                        <Text style={styles.blurb}>{l.blurb}</Text>
                        <Text style={styles.effect}>
                          {level > 0 ? describeLegacy(id, level) : 'Not bought yet'}
                          {!maxed && <Text style={styles.next}>  →  {describeLegacy(id, level + 1)}</Text>}
                        </Text>
                      </View>
                      <Pressable
                        disabled={!afford}
                        onPress={() => onBuy(id)}
                        style={({ pressed }) => [styles.buy, !afford && styles.disabled, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={maxed ? `${l.name} is at the top level` : `Buy ${l.name} for ${cost} Anchors`}
                      >
                        <Text style={styles.buyText}>{maxed ? 'Top' : `⚓ ${cost}`}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>

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
    maxWidth: 420,
    maxHeight: '94%',
    gap: 9,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  lede: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  hero: { alignItems: 'center', backgroundColor: '#3b1f5c', borderRadius: 12, paddingVertical: 12, gap: 2 },
  heroAnchors: { color: '#ffd23f', fontSize: 30, fontWeight: '900' },
  heroLabel: { color: '#e9ddff', fontSize: 12, fontWeight: '700' },
  box: { backgroundColor: theme.bg, borderRadius: 10, padding: 11, gap: 6 },
  boxTitle: { color: theme.text, fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  keep: { color: theme.good, fontSize: 13, fontWeight: '700' },
  lose: { color: '#c0392b', fontSize: 13, fontWeight: '700' },
  value: { color: theme.text, fontSize: 14, fontWeight: '800' },
  gold: { color: theme.moneyText },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#8e5bd6' },
  hint: { color: theme.textDim, fontSize: 11 },
  primary: { backgroundColor: '#6c3fb5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  disabled: { backgroundColor: theme.disabled },
  pressed: { opacity: 0.85 },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
  section: { color: theme.text, fontSize: 13, fontWeight: '900', marginTop: 2 },
  scroll: { maxHeight: 280 },
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 9,
    backgroundColor: theme.panel,
  },
  icon: { fontSize: 22, width: 30, textAlign: 'center' },
  info: { flex: 1, gap: 1 },
  name: { color: theme.text, fontSize: 13, fontWeight: '900' },
  level: { color: theme.textDim, fontSize: 11, fontWeight: '700' },
  blurb: { color: theme.textDim, fontSize: 11 },
  effect: { color: theme.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  next: { color: theme.good, fontWeight: '900' },
  buy: { backgroundColor: '#6c3fb5', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', minWidth: 62 },
  buyText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
});
