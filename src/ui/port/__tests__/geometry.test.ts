import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../config/balance';
import {
  SCENE,
  clamp01,
  containerRows,
  craneCount,
  easeOutCubic,
  pingPong,
  shipScale,
  wavePath,
} from '../geometry';

/**
 * Scene maths tests. These guard the visual invariants that are easy to break
 * by nudging a constant — most importantly that a fully laden deck stack still
 * passes under the crane booms.
 */

/** Mirrors Ship.tsx: deck sits 16 units above the waterline, boxes are 6 tall. */
const DECK_OFFSET = 16;
const BOX_H = 6;

const stackTopY = (level: number) =>
  SCENE.waterlineY - (DECK_OFFSET + containerRows(level) * BOX_H) * shipScale(level);

describe('ship growth is bounded', () => {
  it('saturates rather than growing with the upgrade level forever', () => {
    // Ship size passes level 130 within a few hours, so the art must cap.
    expect(shipScale(1000)).toBe(shipScale(500));
    expect(containerRows(1000)).toBe(containerRows(500));
    expect(shipScale(1000)).toBeLessThanOrEqual(1.3);
    expect(containerRows(1000)).toBeLessThanOrEqual(5);
  });

  it('grows monotonically up to the cap', () => {
    for (let l = 1; l < 60; l++) {
      expect(shipScale(l)).toBeGreaterThanOrEqual(shipScale(l - 1));
      expect(containerRows(l)).toBeGreaterThanOrEqual(containerRows(l - 1));
    }
  });

  it('keeps a full deck stack clear of the crane booms at every level', () => {
    // Smaller y is higher on screen, so the stack top must stay BELOW the
    // gantry line. Bumping shipScale without raising gantryY breaks this.
    for (let l = 0; l <= 1000; l += 7) {
      expect(stackTopY(l)).toBeGreaterThan(SCENE.gantryY);
    }
  });

  it('keeps the widest hull inside the scene', () => {
    const HULL_LENGTH = 124;
    expect(SCENE.berthX + HULL_LENGTH * shipScale(1000)).toBeLessThanOrEqual(SCENE.width);
  });

  it('floats hulls clear of the quay coping', () => {
    expect(SCENE.waterlineY).toBeLessThan(SCENE.quayY);
    expect(SCENE.quayY - SCENE.waterlineY).toBeGreaterThanOrEqual(10);
  });
});

describe('cranes', () => {
  it('scales with the upgrade but stays within what the berth can hold', () => {
    expect(craneCount(0)).toBe(1);
    expect(craneCount(BALANCE.upgrades.cranes.maxLevel!)).toBeLessThanOrEqual(4);
    expect(craneCount(1000)).toBe(4);
  });
});

describe('easing helpers', () => {
  it('clamps and eases between the expected endpoints', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('ping-pongs smoothly without jumping at the wrap', () => {
    expect(pingPong(0)).toBeCloseTo(0);
    expect(pingPong(0.5)).toBeCloseTo(1);
    expect(pingPong(0.999)).toBeCloseTo(0, 2);
    expect(pingPong(1.001)).toBeCloseTo(0, 2);
  });
});

describe('wave path', () => {
  it('spans the full scene width and stays finite', () => {
    const d = wavePath(100, 2, 60, 1.5);
    expect(d).toMatch(/^M0(\.0)?,/);
    expect(d).not.toContain('NaN');
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeCloseTo(SCENE.width);
  });
});
