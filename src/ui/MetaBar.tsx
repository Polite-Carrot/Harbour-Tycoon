import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { formatCount } from '../sim/format';
import { theme } from './theme';

interface Props {
  stars: number;
  /** Stars a sale would bring right now. */
  pending: number;
  dailyBadge: number;
  /** Managers that could be hired or promoted right now. */
  managersBadge: number;
  onHeadOffice: () => void;
  onDaily: () => void;
  onManagers: () => void;
}

/** The big buttons above the ports: Head Office (prestige), Managers and Daily. */
export function MetaBar({ stars, pending, dailyBadge, managersBadge, onHeadOffice, onDaily, onManagers }: Props) {
  // Three across is tight on a phone: stack each button's icon over its text,
  // and keep the second line short.
  const narrow = useWindowDimensions().width < 560;
  const button = [styles.button, narrow && styles.buttonNarrow];
  const text = narrow ? styles.textNarrow : null;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onHeadOffice}
        style={({ pressed }) => [...button, styles.office, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Head Office"
      >
        <Text style={styles.icon}>🏢</Text>
        <View style={[styles.shrink, text]}>
          <Text style={[styles.label, styles.light]} numberOfLines={1}>Head Office</Text>
          <Text style={[styles.sub, styles.lightDim]} numberOfLines={1}>
            ⭐ {formatCount(stars)}
            {pending > 0 ? <Text style={styles.pending}>  +{formatCount(pending)}{narrow ? '' : ' to sell'}</Text> : null}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onManagers}
        style={({ pressed }) => [...button, styles.managers, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Managers"
      >
        <Text style={styles.icon}>👷</Text>
        <View style={[styles.shrink, text]}>
          <Text style={styles.label} numberOfLines={1}>Managers</Text>
          <Text style={styles.sub} numberOfLines={1}>{managersBadge > 0 ? `${managersBadge} to hire` : 'Your staff'}</Text>
        </View>
        {managersBadge > 0 && (
          <View style={[styles.badge, styles.badgeGood]}>
            <Text style={styles.badgeText}>{managersBadge}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={onDaily}
        style={({ pressed }) => [...button, styles.daily, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Daily rewards"
      >
        <Text style={styles.icon}>📅</Text>
        <View style={[styles.shrink, text]}>
          <Text style={styles.label} numberOfLines={1}>Daily</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {dailyBadge > 0 ? (narrow ? `${dailyBadge} to claim` : `${dailyBadge} ready to claim`) : narrow ? 'Streak' : 'Streak & contracts'}
          </Text>
        </View>
        {dailyBadge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{dailyBadge}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 2,
  },
  buttonNarrow: { flexDirection: 'column', gap: 2, paddingHorizontal: 6, paddingVertical: 6 },
  textNarrow: { alignItems: 'center' },
  office: { backgroundColor: '#0b3d6b', borderColor: '#ffd23f' },
  daily: { backgroundColor: theme.panel, borderColor: theme.accent },
  managers: { backgroundColor: theme.panel, borderColor: theme.good },
  shrink: { flexShrink: 1 },
  badgeGood: { backgroundColor: theme.good },
  pressed: { opacity: 0.85 },
  icon: { fontSize: 20 },
  label: { fontSize: 13, fontWeight: '900', color: theme.text },
  sub: { fontSize: 11, fontWeight: '700', color: theme.textDim },
  pending: { color: '#7ee2a8', fontWeight: '900' },
  light: { color: '#ffffff' },
  lightDim: { color: '#ffd23f' },
  badge: {
    position: 'absolute',
    top: -7,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e63946',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
});
