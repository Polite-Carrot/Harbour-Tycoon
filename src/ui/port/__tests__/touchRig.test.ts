import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HOME_OFFSET, HOME_TARGET } from '../../port3d/HarbourWorld';
import { CAMERA_LIMITS } from '../harbourRuntime';
import { TouchRig } from '../touchRig';

function rig() {
  const camera = new THREE.PerspectiveCamera(42, 0.5, 1, 4000);
  const r = new TouchRig(camera);
  r.target.copy(HOME_TARGET);
  camera.position.copy(HOME_TARGET).add(HOME_OFFSET);
  r.update();
  return { camera, r };
}
const dist = (c: THREE.Camera, t: THREE.Vector3) => c.position.distanceTo(t);

describe('touch camera controls (apps)', () => {
  it('a one-finger drag slides the view along the ground, keeping height and distance', () => {
    const { camera, r } = rig();
    const before = { y: camera.position.y, d: dist(camera, r.target), t: r.target.clone() };
    r.pan(120, -80, 700);
    expect(r.target.distanceTo(before.t)).toBeGreaterThan(10);
    expect(r.target.y).toBeCloseTo(before.t.y, 6);
    expect(camera.position.y).toBeCloseTo(before.y, 6);
    expect(dist(camera, r.target)).toBeCloseTo(before.d, 6);
  });

  it('dragging right moves the ground right, i.e. the view moves left', () => {
    const { camera, r } = rig();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const t0 = r.target.clone();
    r.pan(100, 0, 700);
    expect(r.target.clone().sub(t0).dot(right)).toBeLessThan(0);
  });

  it('pinching zooms within the same limits as the web', () => {
    const { camera, r } = rig();
    const d0 = dist(camera, r.target);
    r.zoom(2);
    expect(dist(camera, r.target)).toBeCloseTo(Math.max(CAMERA_LIMITS.minDistance, d0 / 2), 4);
    r.zoom(1000);
    expect(dist(camera, r.target)).toBeCloseTo(CAMERA_LIMITS.minDistance, 4);
    r.zoom(0.0001);
    expect(dist(camera, r.target)).toBeCloseTo(CAMERA_LIMITS.maxDistance, 4);
  });

  it('twisting turns around the target; tilting stays inside the angle limits', () => {
    const { camera, r } = rig();
    const before = camera.position.clone();
    r.rotate(0.5);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(5);
    expect(camera.position.y).toBeCloseTo(before.y, 4);
    for (let i = 0; i < 20; i++) r.tilt(400, 700);
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(r.target));
    expect(s.phi).toBeLessThanOrEqual(CAMERA_LIMITS.maxPolarAngle + 1e-9);
    for (let i = 0; i < 20; i++) r.tilt(-400, 700);
    s.setFromVector3(camera.position.clone().sub(r.target));
    expect(s.phi).toBeGreaterThanOrEqual(CAMERA_LIMITS.minPolarAngle - 1e-9);
  });
});
