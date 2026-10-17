import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { BALANCE, type UpgradeId } from '../config/balance';
import { dayIndex, rollDay } from '../sim/daily';
import { totalIncome } from '../sim/economy';
import {
  buyPort,
  buyUpgrade,
  catchUp,
  claimContract,
  claimEvent,
  claimLogin,
  claimOfflineAdBonus,
  claimTimeWarp,
  claimVip,
  createNewGame,
  selectPort,
  sellCompany,
} from '../sim/engine';
import { gameStats } from '../sim/stats';
import type { BuyQuantity, GameState, OfflineReport } from '../sim/types';
import { clearSave, loadGame, saveGame } from './persistence';

/**
 * Wires the pure sim to React and to the app lifecycle.
 *
 * The sim itself is untouched by anything in here — this hook only decides
 * WHEN to call it (every UI tick, on resume, on purchase) and when to persist.
 */
/** Today's day number in the player's own time zone. */
export const today = (now = Date.now()) => dayIndex(now, new Date(now).getTimezoneOffset());

/** Turn the daily state over at local midnight: new contracts, streak check. */
function withToday(state: GameState, now: number): GameState {
  const day = today(now);
  if (state.daily.day === day) return state;
  return rollDay(state, day, totalIncome(state), gameStats(state).shipsPerMinute);
}

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
      commit(withToday(result.state, now));
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
  /** Settle to now, apply `change`, commit, and persist if anything happened. */
  const act = useCallback(
    (change: (s: GameState) => { state: GameState; changed: boolean }) => {
      const current = stateRef.current;
      if (!current) return;
      // Settle first so the action can't swallow or duplicate a partial tick.
      const settled = catchUp(current, Date.now(), BALANCE, false).result.state;
      const { state: next, changed } = change(settled);
      commit(next);
      if (changed) void saveGame(next);
    },
    [commit],
  );

  const buy = useCallback(
    (id: UpgradeId, quantity: BuyQuantity = 1) => {
      act((s) => {
        const r = buyUpgrade(s, id, quantity);
        return { state: r.state, changed: r.bought > 0 };
      });
    },
    [act],
  );

  const buyNewPort = useCallback(() => {
    act((s) => {
      const r = buyPort(s);
      return { state: r.state, changed: r.bought };
    });
  }, [act]);

  const choosePort = useCallback(
    (index: number) => {
      act((s) => {
        const next = selectPort(s, index);
        return { state: next, changed: next !== s };
      });
    },
    [act],
  );

  const sell = useCallback(() => {
    act((s) => {
      const r = sellCompany(s, Date.now());
      return { state: r.state, changed: r.stars > 0 };
    });
  }, [act]);

  const claimDailyLogin = useCallback(() => {
    act((s) => {
      const r = claimLogin(s, today(), Date.now());
      return { state: r.state, changed: !!r.reward };
    });
  }, [act]);

  const claimDailyContract = useCallback(
    (index: number) => {
      act((s) => {
        const r = claimContract(s, index, Date.now());
        return { state: r.state, changed: !!r.reward };
      });
    },
    [act],
  );

  const welcomeVip = useCallback(() => {
    act((s) => {
      const r = claimVip(s, Date.now());
      return { state: r.state, changed: !!r.reward };
    });
  }, [act]);

  const collectEvent = useCallback(() => {
    act((s) => {
      const r = claimEvent(s, Date.now());
      return { state: r.state, changed: !!r.reward };
    });
  }, [act]);

  /** Pay a Time Warp. Returns what it paid (0 if refused). Call after the ad. */
  const warp = useCallback((): number => {
    let paid = 0;
    act((s) => {
      const r = claimTimeWarp(s, today(), Date.now());
      paid = r.earned;
      return { state: r.state, changed: r.earned > 0 };
    });
    return paid;
  }, [act]);

  const resetGame = useCallback(async () => {
    await clearSave();
    commit(createNewGame(Date.now()));
    setOfflineReport(null);
  }, [commit]);

  const dismissOfflineReport = useCallback(() => setOfflineReport(null), []);

  /**
   * Pay the "while away" ad bonus and close the popup. Returns the extra paid.
   * Call only after the rewarded ad. Closing the popup with it is what stops
   * one report being boosted twice.
   */
  const boostOfflineReport = useCallback((): number => {
    const report = offlineReport;
    if (!report) return 0;
    let paid = 0;
    act((s) => {
      const r = claimOfflineAdBonus(s, report, Date.now());
      paid = r.earned;
      return { state: r.state, changed: r.earned > 0 };
    });
    setOfflineReport(null);
    return paid;
  }, [act, offlineReport]);

  return {
    state: snapshot,
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
    warp,
  };
}
