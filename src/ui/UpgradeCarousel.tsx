import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type UpgradeId } from '../config/balance';
import { paybackSeconds } from '../sim/economy';
import { formatDuration, formatMoney, formatRate } from '../sim/format';
import type { BuyQuantity, UpgradeAffordability } from '../sim/types';
import { theme } from './theme';

const QUANTITIES: BuyQuantity[] = [1, 10, 'max'];
const label = (q: BuyQuantity) => (q === 'max' ? 'MAX' : `x${q}`);

interface Props {
  entries: UpgradeAffordability[];
  /** Income gain per upgrade, keyed by id, for the current buy quantity. */
  gains: Record<UpgradeId, number>;
  quantity: BuyQuantity;
  onQuantity: (q: BuyQuantity) => void;
  onBuy: (id: UpgradeId) => void;
}

/**
 * The buy carousel: every upgrade track on one horizontal rail, cheapest on
 * the left, most expensive on the right.
 *
 * Order comes from UPGRADE_ORDER and is deliberately FIXED rather than sorted
 * by live cost — costs grow exponentially as levels are bought, so a live sort
 * would reshuffle tiles between taps and the player would buy the wrong thing.
 * Tracks the player cannot afford yet still show, dimmed, so the right-hand end
 * of the rail reads as something to work toward.
 */
export function UpgradeCarousel({ entries, gains, quantity, onQuantity, onBuy }: Props) {
  return (
    <View style={styles.dock}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>BUY</Text>
        {QUANTITIES.map((q) => {
          const on = q === quantity;
          return (
            <Pressable
              key={String(q)}
              onPress={() => onQuantity(q)}
              style={[styles.quantityChip, on && styles.quantityChipOn]}
            >
              <Text style={[styles.quantityText, on && styles.quantityTextOn]}>{label(q)}</Text>
            </Pressable>
          );
        })}
        <View style={styles.spacer} />
        <Text style={styles.hint}>pricier →</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
      >
        {entries.map((entry) => {
          const cfg = BALANCE.upgrades[entry.id];
          const gain = gains[entry.id] ?? 0;
          // A timing track pinned against its floor still has levels left to
          // buy but adds nothing. Never invite the player to spend on that.
          const dead = !entry.maxed && gain <= 0;
          const enabled = entry.affordable && !entry.maxed && !dead;
          const payback = paybackSeconds(entry.cost, gain);

          return (
            <Pressable
              key={entry.id}
              onPress={() => onBuy(entry.id)}
              disabled={!enabled}
              style={({ pressed }) => [
                styles.tile,
                enabled ? styles.tileReady : styles.tileIdle,
                pressed && enabled && styles.tilePressed,
              ]}
            >
              <View>
                <Text style={styles.tileName} numberOfLines={1}>
                  {cfg.name}
                </Text>
                <Text style={styles.tileLevel}>
                  Lv {entry.level}
                  {cfg.maxLevel !== null ? ` / ${cfg.maxLevel}` : ''}
                </Text>
                <Text style={styles.tileBlurb} numberOfLines={2}>
                  {cfg.blurb}
                </Text>
              </View>

              <View>
                <Text style={[styles.tileGain, !enabled && styles.tileGainOff]} numberOfLines={1}>
                  {entry.maxed
                    ? 'fully upgraded'
                    : dead
                      ? 'no further effect'
                      : `+${formatRate(gain)}`}
                </Text>

                {!entry.maxed && !dead && Number.isFinite(payback) && (
                  <Text style={styles.payback} numberOfLines={1}>
                    pays back {payback < 1 ? '<1s' : formatDuration(payback)}
                  </Text>
                )}

                <View style={[styles.costPill, enabled && styles.costPillReady]}>
                  {entry.maxed || dead ? (
                    <Text style={styles.costMaxed}>{entry.maxed ? 'MAX' : 'CAPPED'}</Text>
                  ) : (
                    <>
                      <Text
                        style={[styles.costText, enabled && styles.costTextReady]}
                        numberOfLines={1}
                      >
                        {formatMoney(entry.cost)}
                      </Text>
                      {entry.count > 1 && <Text style={styles.costCount}>x{entry.count}</Text>}
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { paddingBottom: 4, gap: 7 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  headerLabel: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginRight: 2,
  },
  spacer: { flex: 1 },
  hint: { color: theme.disabled, fontSize: 10, fontWeight: '600' },

  quantityChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panel,
  },
  quantityChipOn: { borderColor: theme.accent, backgroundColor: theme.panelAlt },
  quantityText: { color: theme.textDim, fontSize: 11, fontWeight: '800' },
  quantityTextOn: { color: theme.accent },

  rail: { flexGrow: 0 },
  railContent: { paddingHorizontal: 12, gap: 8, alignItems: 'stretch' },

  tile: {
    width: 132,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'space-between',
    gap: 8,
  },
  tileIdle: { backgroundColor: theme.panel, borderColor: theme.border, opacity: 0.55 },
  tileReady: { backgroundColor: theme.panelAlt, borderColor: theme.accent },
  tilePressed: { backgroundColor: theme.border },

  tileName: { color: theme.text, fontSize: 14, fontWeight: '800' },
  tileLevel: { color: theme.textDim, fontSize: 11, fontWeight: '600' },
  tileBlurb: { color: theme.disabled, fontSize: 10, marginTop: 3, lineHeight: 13 },
  tileGain: { color: theme.good, fontSize: 11, fontWeight: '700' },
  payback: { color: theme.textDim, fontSize: 10, marginTop: 1 },
  tileGainOff: { color: theme.disabled },

  costPill: {
    marginTop: 5,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  costPillReady: { backgroundColor: theme.money },
  costText: { color: theme.disabled, fontSize: 13, fontWeight: '800' },
  costTextReady: { color: theme.bg },
  costCount: { color: theme.bg, fontSize: 9, fontWeight: '800', opacity: 0.75 },
  costMaxed: { color: theme.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
