import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { UnityAds } from '../../modules/unity-ads';
import { UNITY_ADS, UNITY_TEST_MODE, type UnityAdsApp } from './config';
import { consentGranted, loadPrivacy, onPrivacyChange } from '../privacy/privacy';

/**
 * Rewarded ads, behind one small interface so the ad network can be swapped
 * without touching the game.
 *
 * `show()` resolves `true` only when the player watched the ad through and
 * earned the reward; closing early resolves `false`. The game pays out only
 * on `true`.
 *
 * In the iOS and Android apps this is Unity Ads (modules/unity-ads, IDs in
 * ./config.ts): the SDK starts at launch, keeps one ad loaded, and loads the
 * next as soon as one has played. On the web, in Expo Go, and on a platform
 * with no Unity app set up yet, it is a stand-in TEST AD: a countdown
 * screen, clearly labelled, that never contacts an ad network.
 */

/** How long the stand-in ad runs before it can be closed with a reward. */
export const TEST_AD_SECONDS = 15;

const unityApp: UnityAdsApp | null =
  Platform.OS === 'ios' ? UNITY_ADS.ios : Platform.OS === 'android' ? UNITY_ADS.android : null;
const unity = UnityAds && unityApp ? { sdk: UnityAds, app: unityApp } : null;

/** The SDK started and an ad loaded, shared so only one load is ever in flight. */
let unityReady: Promise<boolean> | null = null;

/** The consent Unity was last told, so a change can throw away an ad loaded under the old one. */
let toldConsent: boolean | null = null;

function syncConsent(): Promise<void> {
  if (!unity) return Promise.resolve();
  const granted = consentGranted();
  if (granted === toldConsent) return Promise.resolve();
  const changed = toldConsent !== null;
  toldConsent = granted;
  // An ad loaded under the old answer would ignore the new one: load afresh.
  if (changed) unityReady = null;
  return unity.sdk.setConsent(granted).catch(() => undefined);
}

if (unity) {
  onPrivacyChange(() => {
    void syncConsent().then(() => prepareUnity());
  });
}

function prepareUnity(): Promise<boolean> {
  if (!unity) return Promise.resolve(false);
  if (!unityReady) {
    // Consent first, so even the first ad request carries the player's choice.
    unityReady = loadPrivacy()
      .then(syncConsent)
      .then(() => unity.sdk.initialize(unity.app.gameId, UNITY_TEST_MODE))
      .then(() => unity.sdk.load(unity.app.rewarded))
      .catch(() => false)
      .then((loaded) => {
        // A failed attempt is forgotten, so the next tap tries again.
        if (!loaded) unityReady = null;
        return loaded;
      });
  }
  return unityReady;
}

async function showUnity(): Promise<boolean> {
  if (!unity) return false;
  const loaded = await prepareUnity();
  if (!loaded) {
    Alert.alert('No ad right now', 'There is no ad ready to watch. Try again in a minute.');
    return false;
  }
  unityReady = null;
  try {
    return (await unity.sdk.show(unity.app.rewarded)) === 'completed';
  } catch {
    return false;
  } finally {
    // Line the next one up straight away.
    void prepareUnity();
  }
}

export function useRewardedAd() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((rewarded: boolean) => void) | null>(null);

  const busy = useRef(false);

  // Start Unity and load the first ad at launch, so the first tap is quick.
  useEffect(() => {
    void prepareUnity();
  }, []);

  const show = useCallback(async (): Promise<boolean> => {
    if (unity) {
      // Never stack two ads; a second request just fails.
      if (busy.current) return false;
      busy.current = true;
      try {
        return await showUnity();
      } finally {
        busy.current = false;
      }
    }
    return new Promise<boolean>((resolve) => {
      if (resolver.current) return resolve(false);
      resolver.current = resolve;
      setOpen(true);
    });
  }, []);

  const finish = useCallback((rewarded: boolean) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(rewarded);
  }, []);

  const element = open ? <TestAd onFinish={finish} /> : null;
  return { show, element };
}

function TestAd({ onFinish }: { onFinish: (rewarded: boolean) => void }) {
  const [left, setLeft] = useState(TEST_AD_SECONDS);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setLeft(Math.max(0, TEST_AD_SECONDS - Math.floor((Date.now() - started) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, []);
  const done = left === 0;

  return (
    <Modal transparent={false} animationType="fade" visible onRequestClose={() => onFinish(done)}>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.label}>TEST AD · no real ad is shown</Text>
          <Pressable
            onPress={() => onFinish(done)}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={done ? 'Close and collect reward' : 'Close without reward'}
          >
            <Text style={styles.closeText}>{done ? '✕' : `${left}s`}</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text style={styles.big}>📺</Text>
          <Text style={styles.title}>Your rewarded ad plays here</Text>
          <Text style={styles.sub}>
            {done ? 'Reward earned! Close the ad to collect.' : `Watch to the end to earn your reward (${left}s)`}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${((TEST_AD_SECONDS - left) / TEST_AD_SECONDS) * 100}%` }]} />
          </View>
          {!done && <Text style={styles.warn}>Closing now gives no reward.</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a', padding: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  close: {
    minWidth: 44,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pressed: { opacity: 0.7 },
  closeText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  big: { fontSize: 64 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  sub: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
  bar: { width: '80%', maxWidth: 360, height: 8, borderRadius: 4, backgroundColor: '#334155', overflow: 'hidden' },
  fill: { height: 8, backgroundColor: '#ffd23f' },
  warn: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
});
