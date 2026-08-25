import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from './src/config/balance';
import { affordability, deriveStats, incomeAfterBuying } from './src/sim/economy';
import { formatMoney, formatRate } from './src/sim/format';
import { useGame } from './src/state/useGame';
import { BerthView } from './src/ui/BerthView';
import { PortScene } from './src/ui/port/PortScene';
import { OfflineModal } from './src/ui/OfflineModal';
import { UpgradeRow } from './src/ui/UpgradeRow';
import { theme } from './src/ui/theme';

export default function App() {
  const { state, ready, offlineReport, buy, resetGame, dismissOfflineReport } = useGame();

  if (!ready || !state) {
    return (
      <SafeAreaView style={[styles.screen, styles.centre]}>
        <Text style={styles.dim}>Opening the harbour…</Text>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  const stats = deriveStats(state, BALANCE);
  const entries = affordability(state, BALANCE);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.money}>{formatMoney(state.money)}</Text>
          <Text style={styles.rate}>{formatRate(stats.moneyPerSecond)}</Text>
        </View>

        <PortScene state={state} stats={stats} />

        <BerthView state={state} stats={stats} />

        <Text style={styles.sectionTitle}>UPGRADES</Text>
        <View style={styles.upgrades}>
          {entries.map((entry) => (
            <UpgradeRow
              key={entry.id}
              entry={entry}
              currentIncome={stats.moneyPerSecond}
              nextIncome={incomeAfterBuying(state, entry.id, BALANCE)}
              onBuy={buy}
            />
          ))}
        </View>

        <View style={styles.statsCard}>
          <Stat label="Lifetime earned" value={formatMoney(state.lifetimeEarnings)} />
          <Stat label="Cycle" value={`${stats.cycleSeconds.toFixed(2)}s`} />
          <Stat label="Unload" value={`${stats.unloadSeconds.toFixed(2)}s`} />
          <Stat label="Price / cargo" value={formatMoney(stats.pricePerUnit)} />
        </View>

        <Pressable style={styles.reset} onPress={() => void resetGame()}>
          <Text style={styles.resetText}>Reset save (dev)</Text>
        </Pressable>
      </ScrollView>

      <OfflineModal report={offlineReport} onDismiss={dismissOfflineReport} />
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16 },
  header: { alignItems: 'center', paddingVertical: 8 },
  money: { color: theme.money, fontSize: 40, fontWeight: '800' },
  rate: { color: theme.good, fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    color: theme.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: -8,
  },
  upgrades: { gap: 10 },
  statsCard: {
    backgroundColor: theme.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 6,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { color: theme.text, fontSize: 13, fontWeight: '600' },
  dim: { color: theme.textDim, fontSize: 13 },
  reset: { alignItems: 'center', paddingVertical: 12 },
  resetText: { color: theme.disabled, fontSize: 12 },
});
