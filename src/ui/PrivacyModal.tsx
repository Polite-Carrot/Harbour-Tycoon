import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_POLICY_URL, answerFirstLaunch, setPersonalizedAds, type PrivacyView } from '../privacy/privacy';
import { theme } from './theme';

/**
 * "Before you start": shown once, on first launch, before the tutorial.
 * Continue brings up Apple's tracking prompt on iOS (privacy.ts). The same
 * set-up as Color Sort.
 */
export function FirstLaunchPrivacy({ privacy }: { privacy: PrivacyView }) {
  const [busy, setBusy] = useState(false);
  if (!privacy.ready || privacy.answered) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>⚓</Text>
          <Text style={styles.title}>Before you start</Text>
          <Text style={styles.line}>
            Harbour Tycoon is free. Ads only play when you choose to watch one for a reward.
          </Text>
          {privacy.asksTracking && (
            <Text style={styles.line}>
              Next, iOS will ask whether the game may use your device's advertising ID. If you allow it, the ads
              you choose to watch can be matched to your interests. If not, they still play, just generic ones.
            </Text>
          )}
          <Text style={styles.note}>You can change this at any time in Settings → Privacy & Data.</Text>
          <Pressable
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              await answerFirstLaunch();
              setBusy(false);
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
          <PolicyLink />
        </View>
      </View>
    </Modal>
  );
}

/** Settings -> Privacy & Data. */
export function PrivacyDataModal({ privacy, visible, onClose }: { privacy: PrivacyView; visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  const on = privacy.personalizedAds;
  const blocked = on && privacy.asksTracking && privacy.att === 'denied';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Privacy & Data</Text>
          <Pressable
            style={styles.row}
            onPress={() => void setPersonalizedAds(!on)}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel="Personalised ads"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Personalised ads</Text>
              <Text style={styles.rowNote}>Ads matched to your interests. Left off, ads still appear but are generic.</Text>
            </View>
            <View style={[styles.track, on && styles.trackOn]}>
              <View style={[styles.knob, on && styles.knobOn]} />
            </View>
          </Pressable>
          {blocked && (
            <Text style={styles.warn}>
              Tracking is turned off for Harbour Tycoon in iOS Settings, so ads stay generic. To change that, go to
              Settings → Privacy & Security → Tracking.
            </Text>
          )}
          <Text style={styles.note}>The game collects no analytics and has no account. Your progress stays on this device.</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
          <PolicyLink />
        </View>
      </View>
    </Modal>
  );
}

function PolicyLink() {
  return (
    <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.link}>Privacy policy</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,61,107,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    gap: 10,
  },
  icon: { fontSize: 34, textAlign: 'center' },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  line: { color: theme.text, fontSize: 14, lineHeight: 20 },
  note: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  warn: { color: '#b3541e', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  primary: { marginTop: 4, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: theme.onAccent, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.85 },
  link: { color: theme.textDim, fontSize: 13, fontWeight: '800', textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.bg, borderRadius: 10, padding: 12 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: theme.text, fontSize: 14, fontWeight: '900' },
  rowNote: { color: theme.textDim, fontSize: 12 },
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: theme.disabled, padding: 3 },
  trackOn: { backgroundColor: theme.good },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff' },
  knobOn: { transform: [{ translateX: 18 }] },
});
