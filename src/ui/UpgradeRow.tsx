import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type UpgradeId } from '../config/balance';
import { formatMoney, formatRate } from '../sim/format';
import type { UpgradeAffordability } from '../sim/types';
import { theme } from './theme';

interface Props {
  entry: UpgradeAffordability;
  /** Income per second after buying one more level — the "what do I get" hint. */
  nextIncome: number;
  currentIncome: number;
  onBuy: (id: UpgradeId) => void;
}

export function UpgradeRow({ entry, nextIncome, currentIncome, onBuy }: Props) {
  const cfg = BALANCE.upgrades[entry.id];
  const gain = nextIncome - currentIncome;
  const enabled = entry.affordable && !entry.maxed;

  return (
    <Pressable
      onPress={() => onBuy(entry.id)}
      disabled={!enabled}
      style={({ pressed }) => [
        styles.row,
        !enabled && styles.rowDisabled,
        pressed && enabled && styles.rowPressed,
      ]}
    >
      <View style={styles.left}>
        <Text style={styles.name}>
          {cfg.name} <Text style={styles.level}>Lv {entry.level}</Text>
        </Text>
        <Text style={styles.blurb}>{cfg.blurb}</Text>
        {!entry.maxed && gain > 0 && (
          <Text style={styles.gain}>+{formatRate(gain)}</Text>
        )}
      </View>

      <View style={styles.right}>
        {entry.maxed ? (
          <Text style={styles.maxed}>MAX</Text>
        ) : (
          <Text style={[styles.cost, entry.affordable ? styles.costOk : styles.costNo]}>
            {formatMoney(entry.cost)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.panelAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  rowDisabled: { opacity: 0.55 },
  rowPressed: { backgroundColor: theme.border },
  left: { flex: 1, gap: 3 },
  right: { paddingLeft: 12 },
  name: { color: theme.text, fontSize: 15, fontWeight: '700' },
  level: { color: theme.textDim, fontSize: 13, fontWeight: '500' },
  blurb: { color: theme.textDim, fontSize: 12 },
  gain: { color: theme.good, fontSize: 12, fontWeight: '600' },
  cost: { fontSize: 15, fontWeight: '700' },
  costOk: { color: theme.money },
  costNo: { color: theme.disabled },
  maxed: { color: theme.textDim, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});
