import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type ManagerId } from '../config/balance';
import { formatMoney } from '../sim/format';
import { MANAGER_ORDER, describeBonus, managerCost, managerLevel } from '../sim/managers';
import type { GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  visible: boolean;
  state: GameState;
  onHire: (id: ManagerId) => void;
  onClose: () => void;
}

/**
 * The managers screen: four staff to hire and promote, each a company-wide
 * bonus, with what they do now, what the next level adds, and its price.
 */
export function ManagersModal({ visible, state, onHire, onClose }: Props) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Managers</Text>
          <Text style={styles.hint}>Hire staff, then promote them. Each one helps every port you own.</Text>
          <ScrollView contentContainerStyle={styles.body}>
            {MANAGER_ORDER.map((id) => {
              const m = BALANCE.managers[id];
              const level = managerLevel(state, id);
              const maxed = level >= m.maxLevel;
              const cost = managerCost(id, level);
              const afford = !maxed && state.money >= cost;
              return (
                <View key={id} style={[styles.row, level === 0 && styles.rowVacant]}>
                  <View style={[styles.portrait, level > 0 && styles.portraitHired]}>
                    <Text style={styles.face}>{m.icon}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name}>
                      {level > 0 ? m.name : 'Vacancy'} <Text style={styles.job}>· {m.title}</Text>
                    </Text>
                    <Text style={styles.blurb}>{m.blurb}</Text>
                    <View style={styles.pips}>
                      {Array.from({ length: m.maxLevel }, (_, i) => (
                        <View key={i} style={[styles.pip, i < level && styles.pipOn]} />
                      ))}
                    </View>
                    <Text style={styles.effect}>
                      {level > 0 ? describeBonus(id, level) : 'Not hired yet'}
                      {!maxed && <Text style={styles.next}>  →  {describeBonus(id, level + 1)}</Text>}
                    </Text>
                  </View>
                  <Pressable
                    disabled={!afford}
                    onPress={() => onHire(id)}
                    style={({ pressed }) => [styles.buy, !afford && styles.buyOff, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={maxed ? `${m.title} is fully promoted` : `${level ? 'Promote' : 'Hire'} the ${m.title} for ${formatMoney(cost)}`}
                  >
                    <Text style={styles.buyLabel}>{maxed ? 'Top level' : level ? 'Promote' : 'Hire'}</Text>
                    {!maxed && <Text style={styles.buyCost}>{formatMoney(cost)}</Text>}
                  </Pressable>
                </View>
              );
            })}
            <Text style={styles.hint}>Managers work for the company: selling it at Head Office lets them go.</Text>
          </ScrollView>
          <Pressable style={styles.secondary} onPress={onClose} accessibilityRole="button">
            <Text style={styles.secondaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,61,107,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: theme.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    width: '100%',
    maxWidth: 420,
    maxHeight: '94%',
    gap: 6,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  body: { gap: 8, paddingBottom: 4, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    backgroundColor: theme.panel,
  },
  rowVacant: { backgroundColor: theme.bg },
  portrait: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  portraitHired: { backgroundColor: theme.panelAlt, opacity: 1, borderWidth: 2, borderColor: theme.good },
  face: { fontSize: 26 },
  info: { flex: 1, gap: 2 },
  name: { color: theme.text, fontSize: 14, fontWeight: '900' },
  job: { color: theme.textDim, fontSize: 12, fontWeight: '700' },
  blurb: { color: theme.textDim, fontSize: 11 },
  pips: { flexDirection: 'row', gap: 3, marginTop: 3 },
  pip: { width: 10, height: 6, borderRadius: 3, backgroundColor: theme.border },
  pipOn: { backgroundColor: theme.good },
  effect: { color: theme.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  next: { color: theme.good, fontWeight: '900' },
  buy: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', minWidth: 84 },
  buyOff: { backgroundColor: theme.disabled },
  buyLabel: { color: theme.onAccent, fontSize: 12, fontWeight: '900' },
  buyCost: { color: theme.onAccent, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  hint: { color: theme.textDim, fontSize: 11, textAlign: 'center' },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
});
