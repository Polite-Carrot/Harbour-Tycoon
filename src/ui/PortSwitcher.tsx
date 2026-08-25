import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { derivePortStats, portCost, portName, portScale } from '../sim/economy';
import { formatMoney, formatNumber } from '../sim/format';
import type { GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  state: GameState;
  onSelect: (index: number) => void;
  onBuyPort: () => void;
}

/**
 * The fleet of ports the player owns, plus the next one to buy.
 *
 * Every port runs its own berth and its own upgrade levels, so this is both a
 * view switcher and the shop for the game's biggest purchase.
 */
export function PortSwitcher({ state, onSelect, onBuyPort }: Props) {
  const owned = state.ports.length;
  const canExpand = owned < BALANCE.ports.maxPorts;
  const nextCost = canExpand ? portCost(owned) : 0;
  const affordable = canExpand && state.money >= nextCost;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {state.ports.map((port, i) => {
        const active = i === state.activePort;
        const stats = derivePortStats(port, i);
        return (
          <Pressable
            key={i}
            onPress={() => onSelect(i)}
            style={[styles.card, active && styles.cardActive]}
          >
            <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
              {portName(i)}
            </Text>
            <Text style={styles.income}>{formatMoney(stats.moneyPerSecond)}/s</Text>
            <Text style={styles.tier}>x{formatNumber(portScale(i))} tier</Text>
          </Pressable>
        );
      })}

      {canExpand && (
        <Pressable
          onPress={onBuyPort}
          disabled={!affordable}
          style={({ pressed }) => [
            styles.card,
            styles.buyCard,
            affordable && styles.buyCardReady,
            pressed && affordable && styles.buyCardPressed,
          ]}
        >
          <Text style={[styles.buyLabel, affordable && styles.buyLabelReady]}>
            BUY PORT
          </Text>
          <Text style={[styles.name, styles.buyName]} numberOfLines={1}>
            {portName(owned)}
          </Text>
          <Text style={[styles.buyCost, affordable && styles.buyCostReady]}>
            {formatMoney(nextCost)}
          </Text>
        </Pressable>
      )}

      {!canExpand && (
        <View style={[styles.card, styles.buyCard]}>
          <Text style={styles.buyLabel}>ALL PORTS</Text>
          <Text style={[styles.name, styles.buyName]}>OWNED</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // flexGrow 0 stops the strip stretching to fill the column, which would
  // otherwise blow the port cards up to full height.
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'flex-start' },
  card: {
    minWidth: 104,
    backgroundColor: theme.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 1,
  },
  cardActive: { borderColor: theme.accent, backgroundColor: theme.panelAlt },
  name: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  nameActive: { color: theme.text },
  income: { color: theme.good, fontSize: 12, fontWeight: '600' },
  tier: { color: theme.disabled, fontSize: 10 },

  buyCard: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  buyCardReady: { borderColor: theme.money, borderStyle: 'solid' },
  buyCardPressed: { backgroundColor: theme.panelAlt },
  buyLabel: { color: theme.disabled, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  buyLabelReady: { color: theme.money },
  buyName: { color: theme.textDim },
  buyCost: { color: theme.disabled, fontSize: 13, fontWeight: '700' },
  buyCostReady: { color: theme.money },
});
