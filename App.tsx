import { useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { UPGRADE_ORDER, type UpgradeId } from './src/config/balance';
import { affordability, deriveStats, incomeAfterBuying, portName, totalIncome } from './src/sim/economy';
import { gameStats } from './src/sim/stats';
import type { BuyQuantity } from './src/sim/types';
import { useGame } from './src/state/useGame';
import { UpgradeCarousel } from './src/ui/UpgradeCarousel';
import { Hud } from './src/ui/Hud';
import { OfflineModal } from './src/ui/OfflineModal';
import { SettingsButton } from './src/ui/SettingsButton';
import { SettingsModal } from './src/ui/SettingsModal';
import { PortSwitcher } from './src/ui/PortSwitcher';
import { DailyModal, dailyBadge } from './src/ui/DailyModal';
import { HeadOfficeModal } from './src/ui/HeadOfficeModal';
import { MetaBar } from './src/ui/MetaBar';
import { VipBanner } from './src/ui/VipBanner';
import { starsFor } from './src/sim/prestige';
import { today } from './src/state/useGame';
import { PortView } from './src/ui/port/PortView';
import { theme } from './src/ui/theme';

export default function App() {
  const {
    state,
    ready,
    offlineReport,
    buy,
    buyNewPort,
    choosePort,
    resetGame,
    dismissOfflineReport,
    sell,
    claimDailyLogin,
    claimDailyContract,
    welcomeVip,
  } = useGame();
  const [officeOpen, setOfficeOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [quantity, setQuantity] = useState<BuyQuantity>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const view = useMemo(() => {
    if (!state) return null;

    const index = Math.min(state.activePort, state.ports.length - 1);
    const port = state.ports[index];
    const stats = deriveStats(state, index);
    const income = totalIncome(state);
    const entries = affordability(state, quantity, index);

    // What each tile is actually worth at the current buy quantity.
    const gains = Object.fromEntries(
      UPGRADE_ORDER.map((id) => {
        const entry = entries.find((e) => e.id === id)!;
        const count = Math.max(1, entry.count);
        return [id, incomeAfterBuying(state, id, count, index) - income];
      }),
    ) as Record<UpgradeId, number>;

    return { index, port, stats, income, entries, gains, summary: gameStats(state) };
  }, [state, quantity]);

  if (!ready || !state || !view) {
    return (
      <SafeAreaView style={[styles.screen, styles.centre]}>
        <Text style={styles.dim}>Opening the harbour…</Text>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* The harbour is the screen. Everything else docks around it. */}
      <View style={styles.scene}>
        <PortView
          port={view.port}
          portIndex={view.index}
          stats={view.stats}
          lastTickAt={state.lastTickAt}
        />
        <Hud
          money={state.money}
          totalIncome={view.income}
          portLabel={portName(view.index)}
          portIndex={view.index}
          portCount={state.ports.length}
          port={view.port}
          stats={view.stats}
          boostUntil={state.boostUntil}
        />
        <VipBanner state={state} now={Date.now()} onWelcome={welcomeVip} />
        <SettingsButton onPress={() => setSettingsOpen(true)} />
      </View>

      <View style={styles.controls}>
        <MetaBar
          stars={state.prestige.stars}
          pending={starsFor(state.runEarnings)}
          dailyBadge={dailyBadge(state, today())}
          onHeadOffice={() => setOfficeOpen(true)}
          onDaily={() => setDailyOpen(true)}
        />
        <PortSwitcher state={state} onSelect={choosePort} onBuyPort={buyNewPort} />

        <UpgradeCarousel
          entries={view.entries}
          gains={view.gains}
          quantity={quantity}
          onQuantity={setQuantity}
          onBuy={(id) => buy(id, quantity)}
        />

      </View>

      <SettingsModal
        visible={settingsOpen}
        stats={view.summary}
        onResume={() => setSettingsOpen(false)}
        onReset={() => {
          setSettingsOpen(false);
          void resetGame();
        }}
      />

      <HeadOfficeModal
        visible={officeOpen}
        state={state}
        onSell={() => {
          setOfficeOpen(false);
          sell();
        }}
        onClose={() => setOfficeOpen(false)}
      />
      <DailyModal
        visible={dailyOpen}
        state={state}
        day={today()}
        onClaimLogin={claimDailyLogin}
        onClaimContract={claimDailyContract}
        onClose={() => setDailyOpen(false)}
      />

      <OfflineModal report={offlineReport} onDismiss={dismissOfflineReport} />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  // The harbour takes every pixel the controls do not need.
  scene: { flex: 1, width: '100%' },
  controls: { flexGrow: 0, paddingBottom: 4 },
  dim: { color: theme.textDim, fontSize: 13 },
});
