import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../../sim/engine';
import { deriveStats } from '../../../sim/economy';
import { HOME_TARGET } from '../../port3d/HarbourWorld';
import { HarbourRuntime } from '../harbourRuntime';
import type { PortViewProps } from '../PortView';
import { TouchRig } from '../touchRig';

function setup() {
  const state = createNewGame(Date.now());
  const props: PortViewProps = { port: state.ports[0], portIndex: 0, stats: deriveStats(state, 0), lastTickAt: state.lastTickAt };
  const runtime = new HarbourRuntime();
  const rig = new TouchRig(runtime.camera);
  runtime.attach(rig);
  runtime.setAspect(0.46);
  runtime.goHome();
  return { runtime, rig, props };
}

describe('the 3D harbour runtime, driven by touch (as in the apps)', () => {
  it('opens on the berth and runs frames without a renderer', () => {
    const { runtime, rig, props } = setup();
    expect(rig.target.distanceTo(HOME_TARGET)).toBeLessThan(1e-6);
    for (let i = 0; i < 120; i++) runtime.step(props, 1 / 60);
    expect(runtime.camera.position.y).toBeGreaterThan(4);
  });

  it('flies back to the berth after the player wanders off', () => {
    const { runtime, rig, props } = setup();
    rig.pan(400, 300, 800);
    rig.rotate(1);
    expect(rig.target.distanceTo(HOME_TARGET)).toBeGreaterThan(20);
    runtime.recenter();
    for (let i = 0; i < 90; i++) runtime.step(props, 1 / 60);
    expect(rig.target.distanceTo(HOME_TARGET)).toBeLessThan(0.5);
    expect(runtime.camera.position.distanceTo(runtime.homeFor(0.46))).toBeLessThan(1);
  });

  it('keeps the view over the harbour however far you drag', () => {
    const { runtime, rig, props } = setup();
    for (let i = 0; i < 200; i++) {
      rig.pan(0, 400, 800);
      runtime.step(props, 1 / 60);
    }
    expect(Math.abs(rig.target.x)).toBeLessThanOrEqual(420);
    expect(rig.target.z).toBeGreaterThanOrEqual(-380);
    expect(rig.target.z).toBeLessThanOrEqual(220);
  });

  it('projects the floating payout onto the view when a ship pays out', () => {
    const { runtime, props } = setup();
    let seen = null;
    for (let i = 0; i < 60 * 30 && !seen; i++) {
      runtime.step(props, 1 / 30);
      seen = runtime.payout(400, 800);
    }
    expect(seen).not.toBeNull();
    expect(seen!.label).toMatch(/^\+\$/);
    expect(seen!.x).toBeGreaterThan(-100);
    expect(seen!.x).toBeLessThan(500);
    void THREE;
  });
});
