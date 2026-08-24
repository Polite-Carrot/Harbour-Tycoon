import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { formatDuration, formatMoney } from '../sim/format';
import type { OfflineReport } from '../sim/types';
import { theme } from './theme';

/** "While you were away" — shown on resume when offline earnings accrued. */
export function OfflineModal({
  report,
  onDismiss,
}: {
  report: OfflineReport | null;
  onDismiss: () => void;
}) {
  if (!report) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>While you were away</Text>
          <Text style={styles.away}>{formatDuration(report.awaySeconds)} away</Text>

          <Text style={styles.earned}>+{formatMoney(report.earned)}</Text>

          {report.wasCapped && (
            <Text style={styles.capped}>
              Offline earnings are capped at{' '}
              {formatDuration(BALANCE.offline.capSeconds)}.
            </Text>
          )}

          <Pressable style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>Collect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 8,
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  away: { color: theme.textDim, fontSize: 13 },
  earned: { color: theme.money, fontSize: 32, fontWeight: '800', marginVertical: 6 },
  capped: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
  button: {
    marginTop: 12,
    backgroundColor: theme.accent,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  buttonText: { color: theme.bg, fontSize: 15, fontWeight: '800' },
});
