import * as THREE from 'three';
import { moonArc, sunArc, type Sky as SkyState } from '../port/daylight';
import { glowSprite, hash, smoothstep } from './util';

const DOME_RADIUS = 1600;
const BODY_DISTANCE = 1300;

/**
 * Everything above the horizon: the gradient dome, sun, moon, stars and a few
 * drifting clouds. The dome follows the camera so it never clips.
 */
export class SkyLayer {
  readonly group = new THREE.Group();
  /** Unit vector toward whichever body is lighting the port right now. */
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  /** 0..1, how far above the horizon that body is. */
  lightHeight = 1;

  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uWater: { value: new THREE.Color() },
  };
  private readonly dome: THREE.Mesh;
  private readonly sun = new THREE.Group();
  private readonly moon = new THREE.Group();
  private readonly sunGlow: THREE.Sprite;
  private readonly stars: THREE.Points;
  private readonly clouds: THREE.Group[] = [];

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uWater;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.55, h), 0.75));
            c = mix(c, uWater, smoothstep(0.0, -0.08, h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // Sun: a hot disc and a wide soft halo.
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(34, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }),
    );
    this.sunGlow = glowSprite(0xffd27a, 420);
    this.sunGlow.material.fog = false;
    this.sun.add(sunDisc, this.sunGlow);
    this.group.add(this.sun);

    const moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(22, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xf1f4ff, fog: false }),
    );
    const moonGlow = glowSprite(0xaebfff, 200);
    moonGlow.material.fog = false;
    moonGlow.material.opacity = 0.6;
    this.moon.add(moonDisc, moonGlow);
    this.group.add(this.moon);

    // Stars on the upper hemisphere. Fixed seed so the sky is always the same.
    const starCount = 700;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = hash(i * 3.1);
      const v = hash(i * 7.7 + 1);
      const theta = u * Math.PI * 2;
      const y = 0.05 + v * 0.95;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(theta) * r * (DOME_RADIUS - 50);
      pos[i * 3 + 1] = y * (DOME_RADIUS - 50);
      pos[i * 3 + 2] = Math.sin(theta) * r * (DOME_RADIUS - 50);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.2,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.group.add(this.stars);

    // Puffy clouds, each a cluster of flat-shaded blobs.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const blob = new THREE.IcosahedronGeometry(1, 1);
    for (let c = 0; c < 14; c++) {
      const g = new THREE.Group();
      const puffs = 4 + Math.floor(hash(c + 40) * 4);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(blob, cloudMat);
        const s = 10 + hash(c * 13 + p) * 12;
        m.scale.set(s * 1.3, s * 0.75, s);
        m.position.set((p - puffs / 2) * 12 + hash(p + c) * 6, hash(c + p * 3) * 6, hash(c * p + 9) * 10 - 5);
        g.add(m);
      }
      g.position.set(hash(c * 5.3) * 1400 - 700, 150 + hash(c * 2.1) * 90, hash(c * 9.9) * 1000 - 600);
      this.clouds.push(g);
      this.group.add(g);
    }
  }

  update(sky: SkyState, tod: number, dt: number, camera: THREE.Camera) {
    this.uniforms.uZenith.value.setHex(sky.zenith);
    this.uniforms.uHorizon.value.setHex(sky.horizon);
    this.uniforms.uWater.value.setHex(sky.water);
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = sky.stars;
    this.stars.visible = sky.stars > 0.01;

    const sa = sunArc(tod);
    const ma = moonArc(tod);
    const sunUp = sa > 0 && sa < 1;
    const sunDir = arcDirection(sa);
    const moonDir = arcDirection(ma);

    this.sun.visible = sunUp;
    this.sun.position.copy(camera.position).addScaledVector(sunDir, BODY_DISTANCE);
    this.sunGlow.material.color.setHex(sky.sun);
    this.moon.visible = !sunUp;
    this.moon.position.copy(camera.position).addScaledVector(moonDir, BODY_DISTANCE);

    const dir = sunUp ? sunDir : moonDir;
    this.lightDir.copy(dir);
    // Fade the key light at the horizon, so the hand-over from sun to moon
    // happens while neither casts much of a shadow.
    this.lightHeight = smoothstep(0.02, 0.25, dir.y);

    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += (2.5 + hash(i) * 3) * dt;
      if (c.position.x > 800) c.position.x = -800;
    }
  }
}

/** East horizon at 0, overhead-ish at 0.5, west horizon at 1. The arc leans
 *  over the sea (negative z) so the faces the camera sees are lit. */
function arcDirection(arc: number): THREE.Vector3 {
  const a = arc * Math.PI;
  return new THREE.Vector3(Math.cos(a), Math.sin(a) * 1.15 - 0.02, -0.65).normalize();
}
