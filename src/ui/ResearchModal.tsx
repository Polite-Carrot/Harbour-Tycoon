import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BALANCE } from '../config/balance';
import type { ResearchId } from '../config/balance';
import { formatDuration } from '../sim/format';
import {
  RESEARCH_ORDER,
  describeResearch,
  isResearchMaxed,
  researchLevel,
  researchProgress,
  researchSeconds,
} from '../sim/research';
import type { GameState } from '../sim/types';
import { theme } from './theme';

interface Props {
  visible: boolean;
  state: GameState;
  now: number;
  /** A rewarded ad is loading or playing. */
  busy: boolean;
  onStart: (id: ResearchId) => void;
  onWatchAd: () => void;
  onClose: () => void;
}

/** True when the lab is empty and there is something left to research: the toolbar badge. */
export function labIdle(state: GameState): boolean {
  return !state.research.active && RESEARCH_ORDER.some((id) => !isResearchMaxed(state, id));
}

/**
 * The research lab: one project at a time, running on the real clock even
 * while the game is closed. What each project does now, what its next level
 * adds, and how long it takes.
 */
export function ResearchModal({ visible, state, now, busy, onStart, onWatchAd, onClose }: Props) {
  if (!visible) return null;
  const active = state.research.active;
  const running = active ? BALANCE.research.projects[active.id] : null;
  const left = active ? Math.max(0, (active.endsAt - now) / 1000) : 0;
  const progress = researchProgress(state, now);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Research Lab</Text>
          <Text style={styles.hint}>One project at a time. Research keeps going while you're away, and it's yours for good.</Text>

          {active && running ? (
            <View style={styles.lab}>
              <Text style={styles.labLabel}>IN THE LAB</Text>
              <Text style={styles.labName}>
                {running.icon} {running.name} · Lv {researchLevel(state, active.id) + 1}
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.labLeft}>{formatDuration(left)} left</Text>
              {!active.adUsed && (
                <Pressable
                  disabled={busy}
                  onPress={onWatchAd}
                  style={({ pressed }) => [styles.ad, busy && styles.off, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Watch an ad to halve the time left"
                >
                  <Text style={styles.adText}>{busy ? 'Loading ad…' : `▶  Watch an ad: halve the time left`}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={[styles.lab, styles.labIdle]}>
              <Text style={[styles.labLabel, styles.labLabelIdle]}>THE LAB IS FREE</Text>
              <Text style={styles.labIdleText}>Pick a project below to start it.</Text>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.body}>
            {RESEARCH_ORDER.map((id) => {
              const p = BALANCE.research.projects[id];
              const level = researchLevel(state, id);
              const maxed = isResearchMaxed(state, id);
              const isActive = active?.id === id;
              const canStart = !active && !maxed;
              return (
                <View key={id} style={[styles.row, isActive && styles.rowActive]}>
                  <Text style={styles.icon}>{p.icon}</Text>
                  <View style={styles.info}>
                    <Text style={styles.name}>
                      {p.name} <Text style={styles.level}>· Lv {level}/{p.maxLevel}</Text>
                    </Text>
                    <Text style={styles.blurb}>{p.blurb}</Text>
                    <Text style={styles.effect}>
                      {level > 0 ? describeResearch(id, level) : 'Not researched yet'}
                      {!maxed && <Text style={styles.next}>  →  {describeResearch(id, level + 1)}</Text>}
                    </Text>
                  </View>
                  <Pressable
                    disabled={!canStart}
                    onPress={() => onStart(id)}
                    style={({ pressed }) => [styles.start, !canStart && styles.off, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={maxed ? `${p.name} is complete` : `Research ${p.name}`}
                  >
                    <Text style={styles.startLabel}>{maxed ? 'Done' : isActive ? 'Running' : 'Research'}</Text>
                    {!maxed && !isActive && <Text style={styles.startTime}>{formatDuration(researchSeconds(state, id, level))}</Text>}
                  </Pressable>
                </View>
              );
            })}
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
    gap: 8,
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  hint: { color: theme.textDim, fontSize: 11, textAlign: 'center' },
  lab: { backgroundColor: '#0b3d6b', borderRadius: 12, padding: 12, gap: 5 },
  labIdle: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
  labLabel: { color: '#ffd23f', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  labLabelIdle: { color: '#8e5bd6' },
  labName: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  labLeft: { color: '#dbeafe', fontSize: 12, fontWeight: '700' },
  labIdleText: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#7ee2a8' },
  ad: { marginTop: 3, backgroundColor: theme.accent, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  adText: { color: theme.onAccent, fontSize: 13, fontWeight: '900' },
  body: { gap: 8, paddingBottom: 4, paddingTop: 2 },
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
  rowActive: { borderColor: theme.good, borderWidth: 2 },
  icon: { fontSize: 26, width: 34, textAlign: 'center' },
  info: { flex: 1, gap: 2 },
  name: { color: theme.text, fontSize: 14, fontWeight: '900' },
  level: { color: theme.textDim, fontSize: 12, fontWeight: '700' },
  blurb: { color: theme.textDim, fontSize: 11 },
  effect: { color: theme.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  next: { color: theme.good, fontWeight: '900' },
  start: { backgroundColor: theme.good, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', minWidth: 84 },
  off: { backgroundColor: theme.disabled },
  startLabel: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  startTime: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: theme.textDim, fontSize: 14, fontWeight: '800' },
});
