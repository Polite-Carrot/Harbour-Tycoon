import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SIGHTING_TEXT, type SightingKind } from './harbourRuntime';

/** How long a sighting prompt stays up, and how long the controls hint shows. */
const SIGHTING_MS = 9000;
const HINT_MS = 6000;

/** The prompt state shared by both platform views: show a kind, it clears itself. */
export function useSightingPrompt() {
  const [sighting, setSighting] = useState<{ kind: SightingKind; id: number } | null>(null);
  useEffect(() => {
    if (!sighting) return;
    const id = setTimeout(() => setSighting(null), SIGHTING_MS);
    return () => clearTimeout(id);
  }, [sighting]);
  return {
    sighting,
    show: (kind: SightingKind) => setSighting((s) => ({ kind, id: (s?.id ?? 0) + 1 })),
    clear: () => setSighting(null),
  };
}

interface Props {
  sighting: { kind: SightingKind; id: number } | null;
  /** How to explore, in this platform's words. */
  hint: string;
  onLook: () => void;
  onRecenter: () => void;
}

/** The buttons and prompts over the 3D harbour: Look at a sighting, back to the berth, the controls hint. */
export function PortOverlays({ sighting, hint, onLook, onRecenter }: Props) {
  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShowHint(false), HINT_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      {sighting && (
        <Pressable
          key={sighting.id}
          onPress={onLook}
          accessibilityRole="button"
          style={({ pressed }) => [styles.sighting, pressed && styles.sightingPressed]}
        >
          <Text style={styles.sightingText}>{SIGHTING_TEXT[sighting.kind]}</Text>
          <Text style={styles.sightingCta}>Look →</Text>
        </Pressable>
      )}

      {showHint && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      <Pressable
        onPress={onRecenter}
        accessibilityRole="button"
        accessibilityLabel="Back to the berth"
        style={({ pressed }) => [styles.recenter, pressed && styles.recenterPressed]}
      >
        <Text style={styles.recenterIcon}>⌖</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    backgroundColor: 'rgba(11,61,107,0.72)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginHorizontal: 16,
  },
  hintText: { color: '#ffffff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sighting: {
    position: 'absolute',
    alignSelf: 'center',
    top: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0b3d6b',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#ffd23f',
  },
  sightingPressed: { backgroundColor: '#145a96' },
  sightingText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  sightingCta: {
    color: '#0b3d6b',
    backgroundColor: '#ffd23f',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  recenter: {
    position: 'absolute',
    right: 10,
    top: 56,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: '#0b3d6b',
  },
  recenterPressed: { backgroundColor: '#ffd23f' },
  recenterIcon: { color: '#0b3d6b', fontSize: 22, fontWeight: '900', lineHeight: 24 },
});
