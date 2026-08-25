import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDuration, formatMoney, formatNumber } from '../sim/format';
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
 * confirmation step.
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
                <Loss label="Upgrades bought" value={formatNumber(stats.totalLevels)} />
              </View>

              <Text style={styles.irreversible}>This cannot be undone.</Text>

              <Pressable
                style={({ pressed }) => [styles.danger, pressed && styles.dangerPressed]}
                onPress={() => {
                  setConfirming(false);
                  onReset();
                }}
              >
                <Text style={styles.dangerText}>Yes, reset everything</Text>
              </Pressable>

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
                <Row label="Upgrades bought" value={formatNumber(stats.totalLevels)} />
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

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
  rowValueStrong: { color: theme.money, fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 3 },

  primary: {
    marginTop: 6,
    backgroundColor: theme.accent,
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryPressed: { opacity: 0.85 },
  primaryText: { color: theme.bg, fontSize: 15, fontWeight: '800' },

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
    backgroundColor: '#a33a3a',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerPressed: { opacity: 0.85 },
  dangerText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
