import * as THREE from 'three';
import { CAMERA_LIMITS, type CameraRig } from './harbourRuntime';

/**
 * Touch camera controls for the apps, standing in for the web's MapControls
 * (which listen for browser pointer events). Same feel and the same limits:
 *
 *  - one finger drags the map (the camera slides over the ground)
 *  - two fingers pinch to zoom, twist to turn, and slide up or down to tilt
 *
 * Pure maths over a camera and a target, so it is tested without a phone.
 */
export class TouchRig implements CameraRig {
  readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly spherical = new THREE.Spherical();
  private readonly right = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  /** Matches the web's MapControls panSpeed. */
  panSpeed = 1.2;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Re-read the camera, apply the limits, and point it at the target. */
  update() {
    this.read();
    this.write();
  }

  private read() {
    this.offset.copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(this.offset);
  }

  private write() {
    const s = this.spherical;
    s.radius = THREE.MathUtils.clamp(s.radius, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance);
    s.phi = THREE.MathUtils.clamp(s.phi, CAMERA_LIMITS.minPolarAngle, CAMERA_LIMITS.maxPolarAngle);
    s.makeSafe();
    this.offset.setFromSpherical(s);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /**
   * Drag the map by (dx, dy) screen points on a view `viewHeight` points
   * tall. The ground under the finger follows it, as with MapControls: the
   * target and camera slide together along the ground, never up or down.
   */
  pan(dx: number, dy: number, viewHeight: number) {
    this.read();
    const perPoint = (2 * this.spherical.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.max(1, viewHeight);
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrix, 0);
    this.forward.crossVectors(TouchRig.UP, this.right);
    const move = this.right
      .clone()
      .multiplyScalar(-dx * perPoint * this.panSpeed)
      .addScaledVector(this.forward, dy * perPoint * this.panSpeed);
    move.y = 0;
    this.target.add(move);
    this.camera.position.add(move);
  }

  /** Pinch: `scale` > 1 when the fingers spread, which moves the camera in. */
  zoom(scale: number) {
    if (!(scale > 0)) return;
    this.read();
    this.spherical.radius /= scale;
    this.write();
  }

  /** Twist: turn the camera around the target by `radians`. */
  rotate(radians: number) {
    this.read();
    this.spherical.theta -= radians;
    this.write();
  }

  /** Two fingers sliding down (dy > 0) tilt the view towards the horizon. */
  tilt(dy: number, viewHeight: number) {
    this.read();
    this.spherical.phi += (dy / Math.max(1, viewHeight)) * Math.PI * 0.6;
    this.write();
  }
}
