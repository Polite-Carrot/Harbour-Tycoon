import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BALANCE } from '../config/balance';
import { formatDuration, formatMoney } from '../sim/format';
import { warpReward, warpStatus } from '../sim/timewarp';
import type { GameState } from '../sim/types';
import { theme } from './theme';

/** Below this width the pill goes compact, so it never reaches the money counter. */
const COMPACT_WIDTH = 640;
/** The money counter is centred and up to ~180 wide: the pill stops short of it. */
const MONEY_CLEARANCE = 100;

/** The pill in the corner of the harbour: what a warp is worth, or when the next one is. */
export function TimeWarpButton({ state, day, now, onPress }: { state: GameState; day: number; now: number; onPress: () => void }) {
  const status = warpStatus(state, day, now);
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH;
  const label = warpLabel(status, formatMoney(warpReward(state)), compact);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        compact && [styles.pillCompact, { maxWidth: width / 2 - MONEY_CLEARANCE }],
        !status.ready && styles.pillOff,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Time Warp"
      accessibilityHint={warpLabel(status, formatMoney(warpReward(state)), false)}
    >
      <Text style={[styles.pillIcon, !status.ready && styles.pillTextOff]}>⏩</Text>
      {label !== '' && (
        <Text style={[styles.pillText, !status.ready && styles.pillTextOff]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Pill text. On a phone there are only ~80px beside the money counter, so
 * compact keeps it to a few characters; tapping opens the full details.
 */
export function warpLabel(status: ReturnType<typeof warpStatus>, reward: string, compact: boolean): string {
  if (status.ready) return compact ? '24h' : `Skip 24h · +${reward}`;
  if (status.reason === 'cooldown') return compact ? shortWait(status.waitSeconds) : `Next warp in ${formatDuration(status.waitSeconds)}`;
  return compact ? '' : 'Back tomorrow';
}

/** Just the biggest unit, rounded up: "2h", "15m", "40s". */
function shortWait(seconds: number): string {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.max(1, Math.ceil(seconds))}s`;
}

interface ModalProps {
  visible: boolean;
  state: GameState;
  day: number;
  now: number;
  /** Set after a successful warp, to show what was collected. */
  collected: number | null;
  busy: boolean;
  onWatch: () => void;
  onClose: () => void;
}

/** Explains the deal, runs the ad, then shows the haul. */
export function TimeWarpModal({ visible, state, day, now, collected, busy, onWatch, onClose }: ModalProps) {
  if (!visible) return null;
  const status = warpStatus(state, day, now);
  const reward = warpReward(state);
  const hours = BALANCE.timeWarp.seconds / 3600;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {collected !== null ? (
            <>
              <Text style={styles.big}>⏩</Text>
              <Text style={styles.title}>{hours} hours later…</Text>
              <Text style={styles.amount}>+{formatMoney(collected)}</Text>
              <Text style={styles.sub}>A whole day of cargo, collected.</Text>
              <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button">
                <Text style={styles.primaryText}>Back to the harbour</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.big}>⏩</Text>
              <Text style={styles.title}>Time Warp</Text>
              <Text style={styles.sub}>
                Watch a short ad to fast-forward {hours} hours and collect a day of income right now.
              </Text>
              <View style={styles.box}>
                <Text style={styles.boxLabel}>You collect</Text>
                <Text style={styles.amount}>+{formatMoney(reward)}</Text>
                <Text style={styles.hint}>
                  {formatMoney(reward / BALANCE.timeWarp.seconds)}/s × {hours} hours, at your current income
                </Text>
              </View>
              <Text style={styles.hint}>
                {status.usesLeft} of {BALANCE.timeWarp.perDay} warps left today · one every{' '}
                {formatDuration(BALANCE.timeWarp.cooldownSeconds)}
              </Text>
              <Pressable
                disabled={!status.ready || busy}
                onPress={onWatch}
                style={({ pressed }) => [styles.primary, (!status.ready || busy) && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>
                  {status.ready
                    ? busy
                      ? 'Loading ad…'
                      : '▶ Watch ad to warp'
                    : status.reason === 'cooldown'
                      ? `Next warp in ${formatDuration(status.waitSeconds)}`
                      : 'All warps used today'}
                </Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 52,
    left: 10,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7c3aed',
    borderColor: '#ffd23f',
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  pillCompact: { gap: 4, paddingHorizontal: 8 },
  pillOff: { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: theme.scrimEdge, borderWidth: 1 },
  pillIcon: { fontSize: 14, color: '#ffffff' },
  pillText: { color: '#ffffff', fontSize: 12, fontWeight: '900', flexShrink: 1 },
  pillTextOff: { color: theme.textDim },
  pressed: { opacity: 0.85 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,61,107,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 9,
  },
  big: { fontSize: 40 },
  title: { color: theme.text, fontSize: 20, fontWeight: '900' },
  sub: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  box: { backgroundColor: theme.bg, borderRadius: 12, padding: 12, alignItems: 'center', alignSelf: 'stretch', gap: 2 },
  boxLabel: { color: theme.textDim, fontSize: 12, fontWeight: '800' },
  amount: { color: theme.moneyText, fontSize: 30, fontWeight: '900' },
  hint: { color: theme.textDim, fontSize: 11, textAlign: 'center' },
  primary: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 13, alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  disabled: { backgroundColor: theme.disabled },
  secondary: { paddingVertical: 6 },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
});
