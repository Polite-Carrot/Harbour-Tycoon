import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCount } from '../sim/format';
import { theme } from './theme';

interface Props {
  stars: number;
  /** Stars a sale would bring right now. */
  pending: number;
  dailyBadge: number;
  onHeadOffice: () => void;
  onDaily: () => void;
}

/** Two big buttons above the ports: Head Office (prestige) and Daily. */
export function MetaBar({ stars, pending, dailyBadge, onHeadOffice, onDaily }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onHeadOffice}
        style={({ pressed }) => [styles.button, styles.office, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Head Office"
      >
        <Text style={styles.icon}>🏢</Text>
        <View>
          <Text style={[styles.label, styles.light]}>Head Office</Text>
          <Text style={[styles.sub, styles.lightDim]}>
            ⭐ {formatCount(stars)}
            {pending > 0 ? <Text style={styles.pending}>  +{formatCount(pending)} to sell</Text> : null}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onDaily}
        style={({ pressed }) => [styles.button, styles.daily, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Daily rewards"
      >
        <Text style={styles.icon}>📅</Text>
        <View>
          <Text style={styles.label}>Daily</Text>
          <Text style={styles.sub}>{dailyBadge > 0 ? `${dailyBadge} ready to claim` : 'Streak & contracts'}</Text>
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
  office: { backgroundColor: '#0b3d6b', borderColor: '#ffd23f' },
  daily: { backgroundColor: theme.panel, borderColor: theme.accent },
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
