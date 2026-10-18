import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatCount, formatDuration, formatMoney, formatNumber } from '../sim/format';
import type { GameStats } from '../sim/stats';
import { theme } from './theme';

interface Props {
  visible: boolean;
  stats: GameStats;
  onResume: () => void;
  onReset: () => void;
}

/**
 * Settings panel: lifetime stats, resume, and a reset guarded by an explicit
 * confirmation step, where the reset button itself has to be held down for
 * {@link HOLD_SECONDS} seconds.
 *
 * The confirmation swaps the panel's contents rather than stacking a second
 * Modal — nested modals are unreliable on react-native-web, and this keeps the
 * destructive action on its own screen where nothing else is tappable.
 */
export function SettingsModal({ visible, stats, onResume, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);

  // Never reopen straight into the confirmation screen.
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);

  if (!visible) return null;

  const close = () => {
    setConfirming(false);
    onResume();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {confirming ? (
            <>
              <Text style={styles.title}>Reset everything?</Text>
              <Text style={styles.warning}>
                This scuttles the whole harbour. You will lose:
              </Text>

              <View style={styles.lossList}>
                <Loss label="Lifetime earnings" value={formatMoney(stats.lifetimeEarnings)} />
                <Loss label="Ports" value={`${stats.portsOwned}`} />
                <Loss label="Upgrades bought" value={formatCount(stats.totalLevels)} />
              </View>

              <Text style={styles.irreversible}>This cannot be undone.</Text>

              <HoldToConfirm
                onConfirm={() => {
                  setConfirming(false);
                  onReset();
                }}
              />

              {/* Cancel is given equal visual weight to the destructive
                  action, so the safe choice is never the harder target. */}
              <Pressable
                style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
                onPress={() => setConfirming(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Harbour Office</Text>

              <ScrollView style={styles.statScroll} contentContainerStyle={styles.stats}>
                <Row label="Lifetime earned" value={formatMoney(stats.lifetimeEarnings)} strong />
                <Row label="In the bank" value={formatMoney(stats.money)} />
                <Row label="Income" value={`${formatMoney(stats.income)}/s`} />
                <Divider />
                <Row label="Ports owned" value={`${stats.portsOwned} / ${stats.maxPorts}`} />
                <Row label="Busiest port" value={stats.bestPortName} />
                <Row label="…earning" value={`${formatMoney(stats.bestPortIncome)}/s`} />
                <Divider />
                <Row label="Reputation" value={`⭐ ${formatCount(stats.stars)}`} />
                <Row label="Companies sold" value={formatCount(stats.resets)} />
                <Row label="Ships handled, all time" value={formatCount(stats.shipsHandled)} />
                <Divider />
                <Row label="Upgrade levels owned" value={formatCount(stats.totalLevels)} />
                <Row label="Ships per minute" value={formatNumber(stats.shipsPerMinute)} />
                <Divider />
                <Row
                  label={`Offline cap (${formatDuration(stats.offlineCapSeconds)})`}
                  value={formatMoney(stats.offlineWindowValue)}
                />
              </ScrollView>

              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
                onPress={close}
              >
                <Text style={styles.primaryText}>Resume</Text>
              </Pressable>

              <Pressable style={styles.secondary} onPress={() => setConfirming(true)}>
                <Text style={styles.resetText}>Reset save</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

function Loss({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.lossValue}>{value}</Text>
    </View>
  );
}

/** How long the reset button must be held before it fires. */
const HOLD_SECONDS = 6;

/**
 * A button that only fires after being held for {@link HOLD_SECONDS}: a bar
 * fills across it while held and drains away if the finger lifts early, so a
 * stray tap can never wipe the save.
 */
function HoldToConfirm({ onConfirm }: { onConfirm: () => void }) {
  const [progress, setProgress] = useState(0);
  const holding = useRef(false);
  const frame = useRef<number | null>(null);
  const progressRef = useRef(0);

  const stopFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => stopFrame, []);

  const set = (p: number) => {
    progressRef.current = p;
    setProgress(p);
  };

  /** Fill while held, drain (four times faster) once let go. */
  const run = () => {
    stopFrame();
    let last = Date.now();
    const step = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      const next = holding.current
        ? progressRef.current + dt / HOLD_SECONDS
        : progressRef.current - (dt * 4) / HOLD_SECONDS;
      if (next >= 1) {
        holding.current = false;
        set(0);
        frame.current = null;
        onConfirm();
        return;
      }
      if (next <= 0) {
        set(0);
        frame.current = null;
        return;
      }
      set(next);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const left = Math.ceil(HOLD_SECONDS * (1 - progress));
  return (
    <Pressable
      style={styles.danger}
      onPressIn={() => {
        holding.current = true;
        run();
      }}
      onPressOut={() => {
        holding.current = false;
        run();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Hold for ${HOLD_SECONDS} seconds to reset everything`}
    >
      <View style={[styles.dangerFill, { width: `${progress * 100}%` }]} />
      <Text style={styles.dangerText}>
        {progress > 0 ? `Keep holding… ${left}s` : `Hold ${HOLD_SECONDS}s to reset`}
      </Text>
    </Pressable>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,61,107,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    gap: 8,
  },
  title: { color: theme.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },

  statScroll: { maxHeight: 300 },
  stats: { gap: 7, paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { color: theme.textDim, fontSize: 13, flexShrink: 1 },
  rowValue: { color: theme.text, fontSize: 13, fontWeight: '700' },
  rowValueStrong: { color: theme.moneyText, fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 3 },

  primary: {
    marginTop: 6,
    backgroundColor: theme.accent,
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryPressed: { opacity: 0.85 },
  primaryText: { color: theme.onAccent, fontSize: 15, fontWeight: '800' },

  secondary: { paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '700' },
  resetText: { color: theme.disabled, fontSize: 13, fontWeight: '700' },

  warning: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  lossList: {
    gap: 6,
    backgroundColor: theme.bg,
    borderRadius: 9,
    padding: 12,
    marginVertical: 4,
  },
  lossValue: { color: '#e07a7a', fontSize: 13, fontWeight: '700' },
  irreversible: {
    color: '#e07a7a',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  cancel: {
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelAlt,
  },
  cancelPressed: { backgroundColor: theme.border },
  cancelText: { color: theme.text, fontSize: 15, fontWeight: '800' },

  danger: {
    backgroundColor: '#6e2a2a',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
    overflow: 'hidden',
    // Long-pressing text on the web would otherwise start a selection.
    userSelect: 'none',
  },
  dangerFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#d64545' },
  dangerText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
