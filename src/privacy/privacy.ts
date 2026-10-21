import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type * as TrackingTransparency from 'expo-tracking-transparency';

/**
 * The player's privacy choices, the same set-up as Color Sort's:
 *
 *  - On first launch a "Before you start" screen (ui/PrivacyModal.tsx) links
 *    the privacy policy. Continue brings up Apple's App Tracking
 *    Transparency prompt on iOS; allowing it turns personalised ads on.
 *  - Settings -> Privacy & Data has a Personalised ads switch.
 *  - Unity is only told consent is granted when that switch is on AND, on
 *    iOS, tracking is allowed. Off (the default), ads still play, just
 *    generic ones.
 *
 * Kept apart from the game save, so resetting the game never re-asks.
 */

export const PRIVACY_POLICY_URL = 'https://politecarrot.com/privacy';

export type AttStatus = 'authorized' | 'denied' | 'notDetermined';

export interface PrivacyPrefs {
  /** The first-launch screen has been answered. */
  answered: boolean;
  personalizedAds: boolean;
}

const KEY = 'harbour-tycoon/privacy/v1';
let prefs: PrivacyPrefs = { answered: false, personalizedAds: false };
let att: AttStatus = 'notDetermined';
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const isIos = Platform.OS === 'ios';
// Loaded on iOS only: the package has no web version and throws on import there.
const tracking: typeof TrackingTransparency | null = isIos ? require('expo-tracking-transparency') : null;

function toAtt(status: string): AttStatus {
  return status === 'granted' ? 'authorized' : status === 'denied' ? 'denied' : 'notDetermined';
}

/** Read the saved choices (and, on iOS, the current tracking answer). Safe to call repeatedly. */
export function loadPrivacy(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw) as Partial<PrivacyPrefs>;
          prefs = { answered: p.answered === true, personalizedAds: p.personalizedAds === true };
        }
      } catch {
        // Defaults: not answered, not personalised.
      }
      if (tracking) {
        try {
          att = toAtt((await tracking.getTrackingPermissionsAsync()).status);
        } catch {
          // Leave it undetermined.
        }
      }
      notify();
    })();
  }
  return loaded;
}

function save() {
  void AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => undefined);
  notify();
}

/** What Unity is told: personalised ads on, and tracking allowed where the platform asks. */
export function consentGranted(): boolean {
  return prefs.personalizedAds && (!isIos || att === 'authorized');
}

/**
 * Apple's tracking prompt. iOS shows it at most once per install; after that
 * this just reports the answer. Android and the web have no such prompt.
 */
export async function requestTracking(): Promise<AttStatus> {
  if (!tracking) return 'authorized';
  try {
    att = toAtt((await tracking.requestTrackingPermissionsAsync()).status);
  } catch {
    // Keep whatever we had.
  }
  notify();
  return att;
}

/** The first-launch Continue: ask about tracking, and turn personalised ads on if it was allowed. */
export async function answerFirstLaunch(): Promise<void> {
  const status = await requestTracking();
  prefs = { answered: true, personalizedAds: isIos && status === 'authorized' };
  save();
}

/** The Privacy & Data switch. Turning it on asks about tracking if iOS never has. */
export async function setPersonalizedAds(on: boolean): Promise<void> {
  prefs = { ...prefs, answered: true, personalizedAds: on };
  save();
  if (on && isIos && att === 'notDetermined') await requestTracking();
}

/** Run `fn` whenever a choice changes. Returns the unsubscribe. */
export function onPrivacyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface PrivacyView extends PrivacyPrefs {
  ready: boolean;
  att: AttStatus;
  /** iOS asks about tracking; other platforms don't. */
  asksTracking: boolean;
}

export function usePrivacy(): PrivacyView {
  const read = (ready: boolean): PrivacyView => ({ ...prefs, ready, att, asksTracking: isIos });
  const [view, setView] = useState<PrivacyView>(() => read(false));
  useEffect(() => {
    let alive = true;
    const off = onPrivacyChange(() => alive && setView(read(true)));
    void loadPrivacy().then(() => alive && setView(read(true)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return view;
}
