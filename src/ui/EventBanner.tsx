import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BALANCE, type HarbourEventKind } from '../config/balance';
import { totalIncome } from '../sim/economy';
import { activeEvent, eventReward } from '../sim/events';
import { formatDuration, formatMoney, formatSeconds } from '../sim/format';
import { dailyRewardMultiplier } from '../sim/prestige';
import type { GameState } from '../sim/types';
import { themeFor, worldOf, type World } from './port3d/theme';

/** What each event is called, and what tapping it does, in each kind of world. */
const COPY: Record<HarbourEventKind, (w: World) => { icon: string; title: string; action: string }> = {
  container: (w) =>
    w === 'sea'
      ? { icon: '📦', title: 'Container overboard!', action: 'Fish it out' }
      : { icon: '📦', title: 'Cargo pod adrift!', action: 'Grab it' },
  storm: (w) =>
    w === 'sea'
      ? { icon: '⛈️', title: 'Storm rolling in!', action: 'Batten down' }
      : w === 'underwater'
        ? { icon: '🌊', title: 'Current surge!', action: 'Seal the hatches' }
        : { icon: '☄️', title: 'Meteor shower!', action: 'Raise the shields' },
  celebrity: (w) =>
    w === 'sea'
      ? { icon: '🛥️', title: 'Celebrity superyacht!', action: 'Red carpet' }
      : w === 'underwater'
        ? { icon: '🛥️', title: 'Celebrity submarine!', action: 'Red carpet' }
        : { icon: '🚀', title: 'Celebrity starliner!', action: 'Red carpet' },
  golden: () => ({ icon: '✨', title: 'Golden ship sighted!', action: 'Claim' }),
  fireworks: (w) =>
    w === 'underwater'
      ? { icon: '🪼', title: 'Jellyfish light show!', action: 'Join the party' }
      : { icon: '🎆', title: 'Fireworks night!', action: 'Join the party' },
  pirates: (w) =>
    w === 'sea'
      ? { icon: '🏴‍☠️', title: 'Pirates off the coast!', action: 'Fire the cannons' }
      : w === 'underwater'
        ? { icon: '🏴‍☠️', title: 'Pirate sub sighted!', action: 'Sound the alarm' }
        : { icon: '🏴‍☠️', title: 'Space pirates!', action: 'Fire the lasers' },
};

const COLOURS: Record<HarbourEventKind, { bg: string; border: string; sub: string }> = {
  container: { bg: '#0e7490', border: '#67e8f9', sub: '#cffafe' },
  storm: { bg: '#334155', border: '#facc15', sub: '#e2e8f0' },
  celebrity: { bg: '#be185d', border: '#fbcfe8', sub: '#fce7f3' },
  golden: { bg: '#a16207', border: '#fde047', sub: '#fef9c3' },
  fireworks: { bg: '#4c1d95', border: '#f0abfc', sub: '#f5d0fe' },
  pirates: { bg: '#1c1917', border: '#ef4444', sub: '#fecaca' },
};

/**
 * A harbour event is on (events.ts): tap the banner to collect before it
 * passes. Sits where the VIP banner does; the two never overlap in time.
 */
export function EventBanner({
  state,
  portIndex,
  now,
  busy = false,
  onCollect,
  onWatchAd,
}: {
  state: GameState;
  portIndex: number;
  now: number;
  /** A rewarded ad is loading or playing. */
  busy?: boolean;
  onCollect: () => void;
  /** Watch an ad to collect `events.adMultiplier` times as much. */
  onWatchAd?: () => void;
}) {
  const ev = activeEvent(state, now);
  if (!ev) return null;
  const copy = COPY[ev.kind](worldOf(themeFor(portIndex)));
  const colour = COLOURS[ev.kind];
  const reward = eventReward(ev.kind, totalIncome(state), dailyRewardMultiplier(state));
  const extra = reward.boostSeconds > 0 ? ` · 2× for ${formatDuration(reward.boostSeconds)}` : '';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onCollect}
        style={({ pressed }) => [styles.banner, { backgroundColor: colour.bg, borderColor: colour.border }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${copy.title} ${copy.action} for ${formatMoney(reward.money)}`}
      >
        <Text style={styles.icon}>{copy.icon}</Text>
        <View style={styles.text}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={[styles.sub, { color: colour.sub }]}>
            Gone in {formatSeconds((ev.end - now) / 1000)}
            {extra}
          </Text>
        </View>
        <Text style={[styles.cta, { backgroundColor: colour.border }]}>
          {copy.action} +{formatMoney(reward.money)}
        </Text>
      </Pressable>
      {onWatchAd && (
        <Pressable
          onPress={onWatchAd}
          disabled={busy}
          style={({ pressed }) => [styles.ad, { borderColor: colour.border }, (pressed || busy) && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Watch an ad for ${formatMoney(reward.money * BALANCE.events.adMultiplier)}`}
        >
          <Text style={styles.adText}>{busy ? '…' : `📺 x${BALANCE.events.adMultiplier}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 124, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 2,
    marginLeft: 16,
    flexShrink: 1,
  },
  ad: {
    marginLeft: 6,
    marginRight: 16,
    backgroundColor: '#ffd23f',
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  adText: { color: '#1f2937', fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.85 },
  icon: { fontSize: 20 },
  text: { flexShrink: 1 },
  title: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  sub: { fontSize: 11, fontWeight: '700' },
  cta: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
