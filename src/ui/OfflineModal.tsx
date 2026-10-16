import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import { formatDuration, formatMoney } from '../sim/format';
import type { OfflineReport } from '../sim/types';
import { theme } from './theme';

/**
 * "While you were away" — shown on resume when offline earnings accrued.
 * The earnings are already banked; Collect just closes it. Watching a
 * rewarded ad multiplies them (x3) instead.
 */
export function OfflineModal({
  report,
  busy = false,
  hidden = false,
  onDismiss,
  onWatchAd,
}: {
  report: OfflineReport | null;
  /** An ad is loading or playing. */
  busy?: boolean;
  /** Hide (but keep) the popup while the ad is on screen. */
  hidden?: boolean;
  onDismiss: () => void;
  onWatchAd?: () => void;
}) {
  if (!report || hidden) return null;
  const k = BALANCE.offline.adMultiplier;

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
              {formatDuration(report.creditedSeconds)}. Head Office perks raise the cap.
            </Text>
          )}

          {onWatchAd && (
            <Pressable
              onPress={onWatchAd}
              disabled={busy}
              style={({ pressed }) => [styles.adButton, busy && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Watch an ad to collect ${formatMoney(report.earned * k)}`}
            >
              <Text style={styles.adTitle}>{busy ? 'Loading ad…' : `📺  Watch ad: x${k}`}</Text>
              <Text style={styles.adSub}>Collect +{formatMoney(report.earned * k)}</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [onWatchAd ? styles.plain : styles.button, pressed && styles.pressed]}
            onPress={onDismiss}
            disabled={busy}
          >
            <Text style={onWatchAd ? styles.plainText : styles.buttonText}>
              {onWatchAd ? `No thanks, collect +${formatMoney(report.earned)}` : 'Collect'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,61,107,0.45)',
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
  earned: { color: theme.moneyText, fontSize: 32, fontWeight: '800', marginVertical: 6 },
  capped: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
  button: {
    marginTop: 12,
    backgroundColor: theme.accent,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  buttonText: { color: theme.onAccent, fontSize: 15, fontWeight: '800' },
  adButton: {
    marginTop: 12,
    backgroundColor: theme.money,
    borderColor: theme.moneyText,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  adTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
  adSub: { color: theme.text, fontSize: 12, fontWeight: '700', marginTop: 2 },
  plain: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 12 },
  plainText: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
});
