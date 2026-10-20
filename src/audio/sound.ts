import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Sound effects and background music.
 *
 * One player per effect, made on first use and rewound to replay. Effects
 * that could fire every few seconds (the ship's horn) are rate-limited, so a
 * busy harbour never turns into a din. The music loops quietly underneath.
 *
 * The player's choices (music on/off, effects on/off) are kept apart from the
 * game save, so resetting the game never resets them.
 *
 * Browsers will not play audio until the page has been touched, so on the web
 * the music waits for the first tap or key press.
 */

const SOURCES = {
  tap: require('../../assets/sounds/tap.mp3'),
  buy: require('../../assets/sounds/buy.mp3'),
  cash: require('../../assets/sounds/cash.mp3'),
  horn: require('../../assets/sounds/horn.mp3'),
  clank: require('../../assets/sounds/clank.mp3'),
  chime: require('../../assets/sounds/chime.mp3'),
  fanfare: require('../../assets/sounds/fanfare.mp3'),
} as const;

export type SoundName = keyof typeof SOURCES;

const VOLUME: Record<SoundName, number> = { tap: 0.35, buy: 0.5, cash: 0.7, horn: 0.45, clank: 0.5, chime: 0.6, fanfare: 0.7 };
/** Shortest gap between two plays of the same effect, in ms. */
const MIN_GAP: Partial<Record<SoundName, number>> = { horn: 25_000, buy: 60, tap: 40 };
const MUSIC_VOLUME = 0.3;

export interface SoundPrefs {
  music: boolean;
  effects: boolean;
}

const PREFS_KEY = 'harbour-tycoon/sound/v1';
let prefs: SoundPrefs = { music: true, effects: true };
const listeners = new Set<(p: SoundPrefs) => void>();
const players = new Map<SoundName, AudioPlayer>();
const lastPlayed = new Map<SoundName, number>();
let music: AudioPlayer | null = null;
let unlocked = Platform.OS !== 'web';
let started = false;

function player(name: SoundName): AudioPlayer | null {
  try {
    let p = players.get(name);
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name];
      players.set(name, p);
    }
    return p;
  } catch {
    return null;
  }
}

/** Play an effect, if effects are on. Never throws: a missing sound is not worth a crash. */
export function play(name: SoundName): void {
  if (!prefs.effects || !unlocked) return;
  const now = Date.now();
  const gap = MIN_GAP[name];
  if (gap && now - (lastPlayed.get(name) ?? -Infinity) < gap) return;
  lastPlayed.set(name, now);
  const p = player(name);
  if (!p) return;
  try {
    void p.seekTo(0);
    p.play();
  } catch {
    // Ignore: sound is a nicety.
  }
}

function syncMusic() {
  try {
    if (prefs.music && unlocked) {
      if (!music) {
        music = createAudioPlayer(require('../../assets/sounds/music.mp3'));
        music.loop = true;
        music.volume = MUSIC_VOLUME;
      }
      music.play();
    } else {
      music?.pause();
    }
  } catch {
    // Ignore.
  }
}

/** Load the player's choices and start the music. Call once, at launch. */
export async function startSound(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SoundPrefs>;
      prefs = { music: p.music !== false, effects: p.effects !== false };
      listeners.forEach((l) => l(prefs));
    }
  } catch {
    // Defaults it is.
  }
  try {
    // Respect the silent switch, and mix with whatever else is playing
    // rather than stopping the player's own music.
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
  } catch {
    // Not every platform has an audio mode.
  }
  if (!unlocked && typeof window !== 'undefined') {
    const unlock = () => {
      unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      syncMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  syncMusic();
}

export function setSoundPrefs(next: Partial<SoundPrefs>): void {
  prefs = { ...prefs, ...next };
  listeners.forEach((l) => l(prefs));
  syncMusic();
  void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => undefined);
}

/** The current choices, kept up to date, for the settings screen. */
export function useSoundPrefs(): SoundPrefs {
  const [value, setValue] = useState(prefs);
  useEffect(() => {
    listeners.add(setValue);
    setValue(prefs);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
