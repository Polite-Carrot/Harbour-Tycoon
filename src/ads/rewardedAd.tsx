import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Rewarded ads, behind one small interface so the ad network can be swapped
 * without touching the game.
 *
 * `show()` resolves `true` only when the player watched the ad through and
 * earned the reward; closing early resolves `false`. The game pays out only
 * on `true`.
 *
 * Right now this is a stand-in TEST AD: a countdown screen, clearly labelled,
 * that never contacts an ad network. To go live, replace `TestAd` with a real
 * provider here, e.g.
 *   - native: react-native-google-mobile-ads `RewardedAd` (needs an EAS dev
 *     build, not Expo Go, plus an AdMob account and ad unit id);
 *   - web: an ad network's rewarded-ad API (Google's H5 games ads need an
 *     approved AdSense site, which a github.io address is not).
 * Keep the contract: resolve true only on the network's "reward earned" event.
 */

/** How long the stand-in ad runs before it can be closed with a reward. */
export const TEST_AD_SECONDS = 15;

export function useRewardedAd() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((rewarded: boolean) => void) | null>(null);

  const show = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        // Never stack two ads; a second request just fails.
        if (resolver.current) return resolve(false);
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

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
