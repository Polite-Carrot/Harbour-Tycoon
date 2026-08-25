import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { gearPath } from './icons';
import { theme } from './theme';

/** Gear cog, pinned to the top right of the scene. */
export function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d={gearPath(12, 12, 11, 7.6, 3.6)} fill={theme.text} fillRule="evenodd" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.scrim,
    borderWidth: 1,
    borderColor: theme.scrimEdge,
  },
  pressed: { backgroundColor: theme.border },
});
