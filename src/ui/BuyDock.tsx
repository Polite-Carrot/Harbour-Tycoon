import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type UpgradeId } from '../config/balance';
import { formatMoney, formatRate } from '../sim/format';
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
 * The buy dock: three upgrade tiles side by side under the scene, with a
 * quantity selector.
 *
 * Replaces the original vertical list. Buying is the thing the player does
 * most, so it gets fixed real estate at the bottom of the screen where a thumb
 * already is, and x10/MAX means late-game levelling is not hundreds of taps.
 */
export function BuyDock({ entries, gains, quantity, onQuantity, onBuy }: Props) {
  return (
    <View style={styles.dock}>
      <View style={styles.quantityRow}>
        <Text style={styles.quantityLabel}>BUY</Text>
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
      </View>

      <View style={styles.tiles}>
        {entries.map((entry) => {
          const cfg = BALANCE.upgrades[entry.id];
          const enabled = entry.affordable && !entry.maxed;
          const gain = gains[entry.id] ?? 0;

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
              <Text style={styles.tileName} numberOfLines={1}>
                {cfg.name}
              </Text>
              <Text style={styles.tileLevel}>Lv {entry.level}</Text>

              <Text style={[styles.tileGain, !enabled && styles.tileGainOff]} numberOfLines={1}>
                {entry.maxed ? '—' : `+${formatRate(gain)}`}
              </Text>

              <View style={[styles.costPill, enabled && styles.costPillReady]}>
                {entry.maxed ? (
                  <Text style={styles.costMaxed}>MAX</Text>
                ) : (
                  <>
                    <Text style={[styles.costText, enabled && styles.costTextReady]} numberOfLines={1}>
                      {formatMoney(entry.cost)}
                    </Text>
                    {entry.count > 1 && (
                      <Text style={styles.costCount}>x{entry.count}</Text>
                    )}
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { paddingHorizontal: 12, paddingBottom: 6, gap: 8 },

  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quantityLabel: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginRight: 2,
  },
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

  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 10,
    gap: 2,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  tileIdle: { backgroundColor: theme.panel, borderColor: theme.border, opacity: 0.6 },
  tileReady: { backgroundColor: theme.panelAlt, borderColor: theme.accent },
  tilePressed: { backgroundColor: theme.border },

  tileName: { color: theme.text, fontSize: 14, fontWeight: '800' },
  tileLevel: { color: theme.textDim, fontSize: 11, fontWeight: '600' },
  tileGain: { color: theme.good, fontSize: 11, fontWeight: '700' },
  tileGainOff: { color: theme.disabled },

  costPill: {
    marginTop: 4,
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
