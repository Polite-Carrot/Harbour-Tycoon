/**
 * The yard gantries (RTGs) at work. Each straddles a four-row block of the
 * container yard and keeps to its own half of it. It owns four stacks in its
 * block and three boxes, and shuffles them round: drive to a stack, run the
 * trolley over the row, lift the top box, carry it over the yard to the
 * next stack, set it down. A whole stack moves A -> B, then B -> C, C -> D,
 * D -> A, and round again.
 *
 * Pure maths of scenery time, like berthing.ts and cargo.ts: no animation
 * state, every box always somewhere.
 *
 * Heights are local to the yard surface (y 0 = ground); x and z are world.
 */

import { CONTAINERS } from './palette';
import { hash } from './util';

/** Yard grid, shared with PortLand.buildYard. */
export const yardX = (col: number) => -122 + col * 6.4;
export const yardZ = (row: number) => 32 + row * 3.2;
/** Height of a stacked box, ground to ground. */
export const STACK_PITCH = 2.52;

/** Each gantry's block (its centre z) and the four stacks it works, in order. */
export const RTGS = [
  { z: 36.8, stacks: [{ col: 3, row: 1 }, { col: 9, row: 3 }, { col: 15, row: 0 }, { col: 10, row: 2 }] },
  { z: 52.8, stacks: [{ col: 22, row: 6 }, { col: 29, row: 8 }, { col: 36, row: 5 }, { col: 31, row: 7 }] },
] as const;

/** Boxes each gantry shuffles. */
export const RTG_BOXES = 3;
/** Seconds per box moved. */
export const RTG_MOVE = 22;
/** Spreader underside when hoisted: a carried box clears a four-high stack. */
export const RTG_HOIST = 13.2;

/** Fractions of a move: drive/trolley out, lower, (grab) hoist, drive across, lower, (release) hoist. */
const SEG = { lower: 0.28, grab: 0.4, carry: 0.5, lowerDrop: 0.8, release: 0.9, end: 1 } as const;

export const isRtgStack = (col: number, row: number) => RTGS.some((r) => r.stacks.some((s) => s.col === col && s.row === row));

export interface RtgWork {
  /** Gantry position along the yard. */
  x: number;
  /** Trolley position across the block, world z. */
  z: number;
  /** Spreader underside, above the ground. */
  under: number;
  carrying: number | null;
  /** The four stacks, each bottom to top, as colours. */
  stacks: { col: number; row: number; boxes: number[] }[];
}

/** Underside height to grip, or set down, the box at stack height h. */
const at = (h: number) => STACK_PITCH * (h + 1);

const smooth = (t: number) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function rtgWork(i: number, t: number): RtgWork {
  const rtg = RTGS[i];
  const S = rtg.stacks;
  const n = S.length;
  const N = RTG_BOXES;
  const L0 = Array.from({ length: N }, (_, k) => CONTAINERS[Math.floor(hash(i * 17.3 + k * 5.1) * CONTAINERS.length)]);

  // Stagger the two so they are never in step.
  const time = Math.max(0, t + i * 5.3);
  const j = Math.floor(time / RTG_MOVE);
  const p = (time - j * RTG_MOVE) / RTG_MOVE;
  const phase = Math.floor(j / N);
  const k = j % N;
  // Each full transfer reverses the order; four transfers bring it back.
  const L = phase % 2 === 0 ? L0 : [...L0].reverse();
  const src = S[phase % n];
  const dst = S[(phase + 1) % n];

  const lifted = p >= SEG.grab;
  const released = p >= SEG.release;
  const srcBoxes = L.slice(0, N - k - (lifted ? 1 : 0));
  const dstBoxes = [...L].reverse().slice(0, k + (released ? 1 : 0));
  const stacks = S.map((s) => ({ col: s.col, row: s.row, boxes: s === src ? srcBoxes : s === dst ? dstBoxes : [] }));

  // Where the last move ended: this move's source if it opened a transfer.
  const prev = k === 0 ? src : dst;
  const pickH = N - 1 - k; // top of the source
  const dropH = k; // top of the destination
  const seg = (a: number, b: number) => smooth((p - a) / (b - a));
  let x: number;
  let z: number;
  let under = RTG_HOIST;
  if (p < SEG.lower) {
    x = lerp(yardX(prev.col), yardX(src.col), seg(0, SEG.lower));
    z = lerp(yardZ(prev.row), yardZ(src.row), seg(0, SEG.lower));
  } else if (p < SEG.carry) {
    x = yardX(src.col);
    z = yardZ(src.row);
    under = p < SEG.grab ? lerp(RTG_HOIST, at(pickH), seg(SEG.lower, SEG.grab)) : lerp(at(pickH), RTG_HOIST, seg(SEG.grab, SEG.carry));
  } else if (p < SEG.lowerDrop) {
    const c = seg(SEG.carry, SEG.lowerDrop - 0.08);
    x = lerp(yardX(src.col), yardX(dst.col), c);
    z = lerp(yardZ(src.row), yardZ(dst.row), c);
  } else {
    x = yardX(dst.col);
    z = yardZ(dst.row);
    under = p < SEG.release ? lerp(RTG_HOIST, at(dropH), seg(SEG.lowerDrop, SEG.release)) : lerp(at(dropH), RTG_HOIST, seg(SEG.release, SEG.end));
  }
  return { x, z, under, carrying: lifted && !released ? L[N - 1 - k] : null, stacks };
}
