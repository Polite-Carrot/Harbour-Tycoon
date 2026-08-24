import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { BALANCE, type UpgradeId } from '../config/balance';
import { buyUpgrade, catchUp, createNewGame } from '../sim/engine';
import type { GameState, OfflineReport } from '../sim/types';
import { clearSave, loadGame, saveGame } from './persistence';

/**
 * Wires the pure sim to React and to the app lifecycle.
 *
 * The sim itself is untouched by anything in here — this hook only decides
 * WHEN to call it (every UI tick, on resume, on purchase) and when to persist.
 */
export function useGame() {
  // The authoritative state lives in a ref so ticks never read a stale
  // closure; `snapshot` is just the copy React renders.
  const stateRef = useRef<GameState | null>(null);
  const [snapshot, setSnapshot] = useState<GameState | null>(null);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [ready, setReady] = useState(false);

  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    setSnapshot(next);
  }, []);

  /** Settle the sim up to `now`, optionally under offline rules. */
  const settle = useCallback(
    (now: number, offline: boolean) => {
      const current = stateRef.current;
      if (!current) return;
      const { result, report } = catchUp(current, now, BALANCE, offline);
      commit(result.state);
      if (report && report.awaySeconds >= BALANCE.offline.minReportSeconds && report.earned > 0) {
        setOfflineReport(report);
      }
    },
    [commit],
  );

  // --- boot: load the save and credit time spent closed ---------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const now = Date.now();
      const loaded = await loadGame(now);
      if (cancelled) return;

      const base = loaded ?? createNewGame(now);
      stateRef.current = base;

      // A fresh game has nothing to catch up on; a loaded one might have hours.
      if (loaded) {
        settle(now, true);
      } else {
        commit(base);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [commit, settle]);

  // --- live tick ------------------------------------------------------------
  // Display cadence only. Every tick asks the wall clock how much time really
  // passed, so a throttled or dropped interval costs the player nothing.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => settle(Date.now(), false), BALANCE.runtime.uiTickMs);
    return () => clearInterval(id);
  }, [ready, settle]);

  // --- autosave -------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (stateRef.current) void saveGame(stateRef.current);
    }, BALANCE.runtime.autosaveSeconds * 1000);
    return () => clearInterval(id);
  }, [ready]);

  // --- save on background / credit on resume --------------------------------
  useEffect(() => {
    if (!ready) return;

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        settle(Date.now(), true);
        return;
      }
      // Leaving the foreground is the last reliable moment to write to disk,
      // so settle the clock first and persist the exact state we leave in.
      settle(Date.now(), false);
      if (stateRef.current) void saveGame(stateRef.current);
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove();
      // Unmount is also a quit path.
      if (stateRef.current) void saveGame(stateRef.current);
    };
  }, [ready, settle]);

  // --- web: tabs close without an AppState transition -----------------------
  // On native, backgrounding is the reliable save point. In a browser a tab can
  // be closed outright, so hook the page lifecycle too or the player loses up
  // to one autosave interval. localStorage writes land synchronously, so this
  // still completes during unload.
  useEffect(() => {
    if (!ready || Platform.OS !== 'web') return;

    const flush = () => {
      settle(Date.now(), false);
      if (stateRef.current) void saveGame(stateRef.current);
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [ready, settle]);

  // --- actions --------------------------------------------------------------
  const buy = useCallback(
    (id: UpgradeId) => {
      const current = stateRef.current;
      if (!current) return;
      // Settle first so the purchase can't swallow or duplicate a partial tick.
      const settled = catchUp(current, Date.now(), BALANCE, false).result.state;
      const { state: next, bought } = buyUpgrade(settled, id);
      commit(next);
      if (bought) void saveGame(next);
    },
    [commit],
  );

  const resetGame = useCallback(async () => {
    await clearSave();
    commit(createNewGame(Date.now()));
    setOfflineReport(null);
  }, [commit]);

  const dismissOfflineReport = useCallback(() => setOfflineReport(null), []);

  return { state: snapshot, ready, offlineReport, buy, resetGame, dismissOfflineReport };
}
