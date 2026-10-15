import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

interface Props {
  open: boolean;
  /** Upgrades the player can buy right now, shown while the panel is hidden. */
  ready: number;
  onToggle: () => void;
}

/**
 * The tab on top of the controls: tuck the upgrades panel away to watch
 * the whole harbour, and pull it back up. While it is hidden it says how
 * many upgrades are waiting, so nothing gets missed.
 */
export function PanelHandle({ open, ready, onToggle }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.tab, !open && ready > 0 && styles.tabReady, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide the upgrades panel' : 'Show the upgrades panel'}
        hitSlop={8}
      >
        <Text style={[styles.text, !open && ready > 0 && styles.textReady]}>
          {open ? '▼  Hide' : ready > 0 ? `▲  Upgrades · ${ready} ready` : '▲  Upgrades'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingTop: 5, paddingBottom: 3 },
  tab: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    shadowColor: '#0b3d6b',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tabReady: { backgroundColor: theme.money, borderColor: theme.moneyText },
  text: { color: theme.textDim, fontSize: 12, fontWeight: '800' },
  textReady: { color: theme.text },
  pressed: { opacity: 0.8 },
});
