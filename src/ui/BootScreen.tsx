import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';

// Keep the phone's own launch screen (black, with the carrot, set in
// app.config.ts) up until this intro is drawn over it, so the two join up.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const LOGO = require('../../assets/brand/polite-carrot-logo.png');
const NAME = require('../../assets/brand/polite-carrot-name.png');

/** How long the lockup stays up once the game is ready, and the fade after it. */
const HOLD_MS = 1350;
const FADE_MS = 550;
/** Never hold the player for longer than this, ready or not. */
const MAX_MS = 4000;

interface Props {
  /** The save has loaded and the harbour can be shown. */
  ready: boolean;
  /** Called once the intro has faded out. */
  onDone: () => void;
}

/**
 * The Polite Carrot opening screen, the same one as Color Sort and Tide
 * Runner: on black, the carrot scales and fades in, the name slides up under
 * it, and once the game is ready the whole thing fades away.
 */
export function BootScreen({ ready, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.68, height * 0.52, 360);
  const logo = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [shownAt] = useState(() => Date.now());
  const leaving = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => setReduced(false));
  }, []);

  // The two-step entrance (timings from Color Sort's styles.css).
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      logo.setValue(1);
      name.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(logo, {
        toValue: 1,
        duration: 700,
        delay: 180,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(name, { toValue: 1, duration: 550, delay: 720, easing: Easing.ease, useNativeDriver: true }),
    ]).start();
  }, [reduced, logo, name]);

  // Leave once the game is ready and the lockup has had its moment (or
  // after MAX_MS regardless).
  useEffect(() => {
    if (reduced === null) return;
    const leave = () => {
      if (leaving.current) return;
      leaving.current = true;
      Animated.timing(fade, { toValue: 0, duration: reduced ? 150 : FADE_MS, useNativeDriver: true }).start(() => onDone());
    };
    const hold = reduced ? 100 : HOLD_MS;
    const timers = [setTimeout(leave, MAX_MS - (Date.now() - shownAt))];
    if (ready) timers.push(setTimeout(leave, Math.max(0, hold - (Date.now() - shownAt))));
    return () => timers.forEach(clearTimeout);
  }, [ready, reduced, fade, onDone, shownAt]);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => undefined}>
      <Animated.View
        style={[styles.screen, { opacity: fade }]}
        onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}
        accessible
        accessibilityLabel="Polite Carrot"
      >
        <View style={[styles.lockup, { width: size }]}>
          <Animated.View
            style={{
              opacity: logo,
              transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            }}
          >
            <Image source={LOGO} style={{ width: size * 0.92, height: size * 0.92 }} resizeMode="contain" />
          </Animated.View>
          <Animated.View
            style={{
              opacity: name,
              marginTop: 12,
              transform: [{ translateY: name.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
          >
            <Image source={NAME} style={{ width: size, height: (size * 121) / 468 }} resizeMode="contain" />
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  lockup: { alignItems: 'center' },
});
