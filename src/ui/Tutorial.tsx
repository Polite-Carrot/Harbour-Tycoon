import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { portPrice } from '../sim/economy';
import { formatMoney } from '../sim/format';
import type { GameState } from '../sim/types';
import { theme } from './theme';

/**
 * The first-time walkthrough: a coach card over the bottom of the harbour.
 *
 * Steps that ask the player to DO something move on by themselves once it is
 * done (`doneWhen`); the rest have a button. Every step can be skipped, and
 * Settings can play it again.
 */

export interface TutorialStep {
  title: string;
  body: (state: GameState) => string;
  /** Moves on by itself once this holds. Steps without it have a button. */
  doneWhen?: (state: GameState) => boolean;
  /** What to point at, for the rest of the UI to highlight. */
  target?: 'cranes' | 'panel' | 'ports' | 'toolbar';
  button?: string;
}

export const TUTORIAL: readonly TutorialStep[] = [
  {
    title: 'Welcome to Harbour Tycoon! ⚓',
    body: () => 'Ships sail in, cranes unload their cargo, and you get paid for every container. Your first ship is on its way in.',
    button: "Let's go",
  },
  {
    title: 'Buy your first upgrade',
    body: (s) =>
      s.money >= BALANCE.upgrades.cranes.baseCost
        ? 'Tap Cranes below. Faster cranes unload every ship quicker, so you earn faster.'
        : `Wait for ${formatMoney(BALANCE.upgrades.cranes.baseCost)} to come in, then tap Cranes below.`,
    doneWhen: (s) => s.totals.upgrades >= 1,
    target: 'cranes',
  },
  {
    title: 'Keep the cash working',
    body: () => 'Each upgrade shows the income it adds and how quickly it pays for itself. Buy three more.',
    doneWhen: (s) => s.totals.upgrades >= 4,
    target: 'panel',
  },
  {
    title: 'Buy in bulk',
    body: () => 'Switch BUY to x10 or MAX to buy many levels in one tap. Hide the panel with the handle to watch the harbour.',
    button: 'Got it',
    target: 'panel',
  },
  {
    title: 'Open new ports',
    body: (s) =>
      s.ports.length > 1
        ? 'Every new port earns more than the last, and they all run at once. Switch between them here.'
        : `Save up ${formatMoney(portPrice(s))} to open your second port. Every new port earns more than the last.`,
    button: 'Next',
    target: 'ports',
  },
  {
    title: 'Grow the company',
    body: () =>
      'Hire Managers to boost every port. Research runs even while you are away. Daily has free rewards. And once you have earned $1M, sell the company at Head Office for Reputation stars.',
    button: 'Next',
    target: 'toolbar',
  },
  {
    title: "You're the harbour master now",
    body: () => 'Your harbour keeps earning while the game is closed, so come back to collect. Good luck!',
    button: 'Start playing',
  },
];

interface Props {
  state: GameState;
  /** The upgrade panel is showing. */
  panelOpen: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export function TutorialCard({ state, panelOpen, onNext, onSkip }: Props) {
  const step = TUTORIAL[state.tutorial.step];
  if (!step || state.tutorial.done) return null;
  const last = state.tutorial.step === TUTORIAL.length - 1;
  // A step about the panel is no use with the panel tucked away.
  const needsPanel = !panelOpen && (step.target === 'cranes' || step.target === 'panel' || step.target === 'ports' || step.target === 'toolbar');
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.count}>
            {state.tutorial.step + 1} / {TUTORIAL.length}
          </Text>
          {!last && (
            <Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip the tutorial">
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{needsPanel ? 'Tap the handle below to open your upgrades.' : step.body(state)}</Text>
        {step.button ? (
          <Pressable
            onPress={onNext}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{step.button}</Text>
          </Pressable>
        ) : (
          <Text style={styles.point}>👇</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center', paddingHorizontal: 14 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.panel,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.accent,
    padding: 14,
    gap: 5,
    shadowColor: '#0b3d6b',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: theme.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  skip: { color: theme.textDim, fontSize: 12, fontWeight: '800' },
  title: { color: theme.text, fontSize: 16, fontWeight: '900' },
  body: { color: theme.textDim, fontSize: 13, lineHeight: 18 },
  button: { marginTop: 4, backgroundColor: theme.accent, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: theme.onAccent, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.85 },
  point: { fontSize: 20, textAlign: 'center', marginTop: 2 },
});
