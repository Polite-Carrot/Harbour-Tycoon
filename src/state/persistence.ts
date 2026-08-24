import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitise } from '../sim/engine';
import type { GameState } from '../sim/types';

const SAVE_KEY = 'harbour-tycoon/save/v1';

/**
 * Local persistence. Deliberately thin: the sim owns validation (see
 * `sanitise`), this module only moves bytes and never throws at the caller.
 */

export async function saveGame(state: GameState): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    // A failed save must never take the game down mid-session.
    console.warn('[harbour] save failed', err);
  }
}

/** Returns null when there is no save, or the save is unreadable. */
export async function loadGame(now: number = Date.now()): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return sanitise(JSON.parse(raw), now);
  } catch (err) {
    console.warn('[harbour] load failed, starting fresh', err);
    return null;
  }
}

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn('[harbour] clear failed', err);
  }
}
