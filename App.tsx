import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ManagersModal } from './src/ui/ManagersModal';
import { managersReady } from './src/sim/managers';
import { MetaBar } from './src/ui/MetaBar';
import { VipBanner } from './src/ui/VipBanner';
import { EventBanner } from './src/ui/EventBanner';
import { starsForSale } from './src/sim/prestige';
import { formatDuration } from './src/sim/format';
import { play, startSound } from './src/audio/sound';
import { ResearchModal, labIdle } from './src/ui/ResearchModal';
import { EmpireModal } from './src/ui/EmpireModal';
import { TUTORIAL, TutorialCard } from './src/ui/Tutorial';
import { today } from './src/state/useGame';
import { useRewardedAd } from './src/ads/rewardedAd';
import { TimeWarpButton, TimeWarpModal } from './src/ui/TimeWarp';
import { PortView } from './src/ui/port/PortView';
import { theme } from './src/ui/theme';
import { PanelHandle } from './src/ui/PanelHandle';
import { usePanelOpen } from './src/state/usePanelOpen';

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
    boostOfflineReport,
    sell,
    claimDailyLogin,
    claimDailyContract,
    welcomeVip,
    collectEvent,
    hire,
    warp,
    research,
    speedUpLab,
    found,
    buyLegacyUpgrade,
    setTutorial,
  } = useGame();
  const ad = useRewardedAd();
  useEffect(() => {
    void startSound();
  }, []);
  const [warpOpen, setWarpOpen] = useState(false);
  const [warpBusy, setWarpBusy] = useState(false);
  const [warpCollected, setWarpCollected] = useState<number | null>(null);
  const [warpStartedAt, setWarpStartedAt] = useState<number | undefined>(undefined);

  const watchForWarp = async () => {
    setWarpBusy(true);
    const rewarded = await ad.show();
    setWarpBusy(false);
    if (!rewarded) return;
    const paid = warp();
    if (paid > 0) {
      setWarpCollected(paid);
      setWarpStartedAt(performance.now());
    }
  };
  const [eventAdBusy, setEventAdBusy] = useState(false);
  const watchForEventBonus = async () => {
    // Pays as of the tap, so an event that ends during the ad still counts.
    const tappedAt = Date.now();
    setEventAdBusy(true);
    const rewarded = await ad.show();
    setEventAdBusy(false);
    if (rewarded) collectEvent({ ad: true, tappedAt });
  };
  const [offlineAdBusy, setOfflineAdBusy] = useState(false);
  const watchForOfflineBonus = async () => {
    setOfflineAdBusy(true);
    const rewarded = await ad.show();
    setOfflineAdBusy(false);
    // Closing the ad early keeps the popup, so the player can still collect.
    if (rewarded) boostOfflineReport();
  };
  const [labAdBusy, setLabAdBusy] = useState(false);
  const watchForLab = async () => {
    setLabAdBusy(true);
    const rewarded = await ad.show();
    setLabAdBusy(false);
    if (rewarded) speedUpLab();
  };
  const [researchOpen, setResearchOpen] = useState(false);
  const [empireOpen, setEmpireOpen] = useState(false);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [quantity, setQuantity] = useState<BuyQuantity>(1);
  const [panelOpen, togglePanel] = usePanelOpen();
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

    // What the hidden panel would offer: affordable, not maxed, and still worth buying.
    const ready = entries.filter((e) => e.affordable && !e.maxed && (gains[e.id] ?? 0) > 0).length;
    return { index, port, stats, income, entries, gains, ready, summary: gameStats(state) };
  }, [state, quantity]);

  // A ship's horn as one docks at the port on screen (rate-limited in sound.ts).
  const berth = useRef<{ index: number; pos: number } | null>(null);
  useEffect(() => {
    if (!view) return;
    const pos = view.port.berthCycleSeconds;
    const prev = berth.current;
    berth.current = { index: view.index, pos };
    if (!prev || prev.index !== view.index) return;
    const arrival = view.stats.arrivalSeconds;
    const docked = prev.pos <= pos ? prev.pos < arrival && pos >= arrival : pos >= arrival || prev.pos < arrival;
    if (docked) play('horn');
  }, [view]);

  // Tutorial steps that ask for an action move on once it is done.
  const tutorialStep = state && !state.tutorial.done ? TUTORIAL[state.tutorial.step] : undefined;
  const tutorialMet = !!(state && tutorialStep?.doneWhen?.(state));
  useEffect(() => {
    if (state && tutorialMet) setTutorial(state.tutorial.step + 1);
  }, [state, tutorialMet, setTutorial]);
  const nextTutorial = () => {
    if (!state) return;
    const next = state.tutorial.step + 1;
    play('tap');
    setTutorial(next, next >= TUTORIAL.length);
  };

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
          lastEventSlot={state.lastEventSlot}
          warpStartedAt={warpStartedAt}
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
        <EventBanner
          state={state}
          portIndex={view.index}
          now={Date.now()}
          busy={eventAdBusy}
          onCollect={() => collectEvent()}
          onWatchAd={watchForEventBonus}
        />
        <TimeWarpButton state={state} day={today()} now={Date.now()} onPress={() => setWarpOpen(true)} />
        <SettingsButton onPress={() => setSettingsOpen(true)} />
        {!offlineReport && (
          <TutorialCard
            state={state}
            panelOpen={panelOpen}
            onNext={nextTutorial}
            onSkip={() => setTutorial(state.tutorial.step, true)}
          />
        )}
      </View>

      <PanelHandle open={panelOpen} ready={view.ready} onToggle={togglePanel} />
      {/* Tucked away, the harbour gets the whole screen. */}
      <View style={[styles.controls, !panelOpen && styles.hidden]}>
        <MetaBar
          stars={state.prestige.stars}
          pending={starsForSale(state)}
          dailyBadge={dailyBadge(state, today())}
          managersBadge={managersReady(state)}
          labIdle={labIdle(state)}
          researchLeft={state.research.active ? formatDuration((state.research.active.endsAt - Date.now()) / 1000) : null}
          onHeadOffice={() => {
            play('tap');
            setOfficeOpen(true);
          }}
          onDaily={() => {
            play('tap');
            setDailyOpen(true);
          }}
          onManagers={() => {
            play('tap');
            setManagersOpen(true);
          }}
          onResearch={() => {
            play('tap');
            setResearchOpen(true);
          }}
        />
        <PortSwitcher state={state} onSelect={choosePort} onBuyPort={buyNewPort} />

        <UpgradeCarousel
          entries={view.entries}
          gains={view.gains}
          quantity={quantity}
          onQuantity={setQuantity}
          onBuy={(id) => buy(id, quantity)}
          highlight={tutorialStep?.target === 'cranes' ? 'cranes' : undefined}
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
        onReplayTutorial={() => {
          setSettingsOpen(false);
          setTutorial(0, false);
        }}
      />

      <HeadOfficeModal
        visible={officeOpen}
        state={state}
        onSell={() => {
          setOfficeOpen(false);
          sell();
        }}
        onEmpire={() => {
          setOfficeOpen(false);
          setEmpireOpen(true);
        }}
        onClose={() => setOfficeOpen(false)}
      />
      <EmpireModal
        visible={empireOpen}
        state={state}
        onFound={() => {
          setEmpireOpen(false);
          found();
        }}
        onBuy={buyLegacyUpgrade}
        onClose={() => setEmpireOpen(false)}
      />
      <ResearchModal
        visible={researchOpen && !ad.element}
        state={state}
        now={Date.now()}
        busy={labAdBusy}
        onStart={research}
        onWatchAd={watchForLab}
        onClose={() => setResearchOpen(false)}
      />
      <ManagersModal visible={managersOpen} state={state} onHire={hire} onClose={() => setManagersOpen(false)} />
      <DailyModal
        visible={dailyOpen}
        state={state}
        day={today()}
        onClaimLogin={claimDailyLogin}
        onClaimContract={claimDailyContract}
        onClose={() => setDailyOpen(false)}
      />

      <TimeWarpModal
        visible={warpOpen && !ad.element}
        state={state}
        day={today()}
        now={Date.now()}
        collected={warpCollected}
        busy={warpBusy}
        onWatch={watchForWarp}
        onClose={() => {
          setWarpOpen(false);
          setWarpCollected(null);
        }}
      />
      {ad.element}

      <OfflineModal
        report={offlineReport}
        busy={offlineAdBusy}
        hidden={!!ad.element}
        onDismiss={dismissOfflineReport}
        onWatchAd={watchForOfflineBonus}
      />
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
  hidden: { display: 'none' },
  dim: { color: theme.textDim, fontSize: 13 },
});
