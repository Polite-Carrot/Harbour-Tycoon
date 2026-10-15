import * as THREE from 'three';
import type { Sky } from '../port/daylight';

/**
 * The sea: Gerstner waves (sharp crests, round troughs, the way real swell
 * looks), sky reflection with Fresnel, sun glitter, whitecaps, foam where the
 * water meets the quay, beach and breakwater, and ship wakes drawn into the
 * surface itself. It is slightly see-through, so whatever swims just below —
 * fish, a whale's back, a ship's bulbous bow — shows through.
 */

/** [direction (radians), wavelength, steepness]. Steepness sums below 1 so
 *  crests never fold over. */
export const WAVES: readonly [number, number, number][] = [
  [0.35, 62, 0.13],
  [-0.45, 37, 0.12],
  [1.25, 23, 0.1],
  [2.5, 17, 0.08],
  [-1.7, 48, 0.08],
  [0.9, 13, 0.06],
];

const G = 9.8;
/** Scales wave speed to the scene's toy scale, so swell does not race. */
const TIME_SCALE = 0.55;

/** Sheltered by the breakwater: 1 inside the harbour basin, 0 at sea. */
export function shelter(x: number, z: number): number {
  return smooth(-140, -92, z) * (1 - smooth(255, 330, x));
}

/** How big the waves are at a point. Calm in the basin, swell outside,
 *  flat far away so the horizon does not shimmer. */
export function waveScale(x: number, z: number): number {
  const s = 1 - shelter(x, z) * 0.72;
  const r = Math.hypot(x, z);
  return s * (1 - smooth(480, 740, r));
}

/** Two ships and two tugs. */
const MAX_WAKES = 4;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uWaves[${WAVES.length}];
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCrest;
  varying float vShelter;
  #include <fog_pars_vertex>

  float sstep(float a, float b, float x) { return smoothstep(a, b, x); }

  void main() {
    vec3 p = position;
    float shelter = sstep(-140.0, -92.0, p.z) * (1.0 - sstep(255.0, 330.0, p.x));
    float scale = (1.0 - shelter * 0.72) * (1.0 - sstep(480.0, 740.0, length(p.xz)));
    vShelter = shelter;

    vec3 disp = vec3(0.0);
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    float crest = 0.0;
    for (int i = 0; i < ${WAVES.length}; i++) {
      vec3 w = uWaves[i];
      vec2 d = vec2(cos(w.x), sin(w.x));
      float k = 6.2831853 / w.y;
      float c = sqrt(${G.toFixed(1)} / k) * ${TIME_SCALE.toFixed(2)};
      float steep = w.z * scale;
      float a = steep / k;
      float f = k * (dot(d, p.xz) - c * uTime);
      float cf = cos(f);
      float sf = sin(f);
      disp.x += d.x * a * cf;
      disp.z += d.y * a * cf;
      disp.y += a * sf;
      tangent += vec3(-d.x * d.x * steep * sf, d.x * steep * cf, -d.x * d.y * steep * sf);
      binormal += vec3(-d.x * d.y * steep * sf, d.y * steep * cf, -d.y * d.y * steep * sf);
      crest += steep * sf;
    }
    p += disp;
    vCrest = crest;
    vNormalW = normalize(cross(binormal, tangent));
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform float uAmbient;
  uniform vec4 uWakeA[${MAX_WAKES}];
  uniform vec4 uWakeB[${MAX_WAKES}];
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCrest;
  varying float vShelter;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 7.1) * 0.15;
  }
  float sdBox(vec2 p, vec2 c, vec2 h) {
    vec2 d = abs(p - c) - h;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    #ifdef CLIP_OUTER
      if (length(vWorld.xz) > 748.0) discard;
    #endif
    vec3 V = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);

    // Small ripples on top of the swell, faded with distance so the far sea
    // stays calm instead of aliasing into noise.
    vec2 q = vWorld.xz;
    float t = uTime;
    float detail = 1.0 - smoothstep(60.0, 420.0, dist);
    vec2 ripple = vec2(
      sin(q.x * 0.9 + q.y * 0.4 + t * 2.1) + sin(q.x * 1.7 - q.y * 1.1 - t * 2.9) * 0.6 + sin(q.y * 2.6 + t * 3.3) * 0.35,
      sin(q.y * 1.1 - q.x * 0.5 + t * 1.8) + sin(q.y * 1.9 + q.x * 1.3 + t * 2.6) * 0.6 + sin(q.x * 2.9 - t * 3.7) * 0.35
    ) * 0.045 * detail;
    vec3 N = normalize(vNormalW + vec3(ripple.x, 0.0, ripple.y));

    // Reflection of the sky, weighted by Fresnel: glassy at grazing angles,
    // see-through looking straight down.
    float cosV = max(dot(N, V), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.45, R.y));

    // Water body: deep blue in the troughs, turquoise where light passes
    // through the crests (stronger looking toward the sun).
    float crest = clamp(vCrest * 1.3 + 0.45, 0.0, 1.0);
    float through = pow(max(dot(-V, uSunDir) * 0.5 + 0.5, 0.0), 3.0);
    vec3 body = mix(uDeep, uShallow, crest * 0.55 + through * crest * 0.6);
    float lambert = max(dot(N, uSunDir), 0.0);
    body *= uAmbient + lambert * uSunStrength * 0.22;

    vec3 col = mix(body, sky, fresnel * 0.75);

    // Sun glitter: a tight highlight plus a broad sheen.
    float spec = pow(max(dot(R, uSunDir), 0.0), 520.0) * mix(9.0, 3.0, smoothstep(150.0, 600.0, dist))
               + pow(max(dot(R, uSunDir), 0.0), 48.0) * 0.25;
    col += uSunColor * spec * uSunStrength * 0.6;

    // --- foam ------------------------------------------------------------------
    float n1 = fbm(q * 0.35 + vec2(t * 0.15, -t * 0.1));
    float n2 = fbm(q * 1.3 - vec2(t * 0.3, t * 0.22));

    // Whitecaps on the sharpest crests, more of them out at sea.
    // Streaky caps along the crest line, broken up by fine noise.
    float n3 = fbm(vec2(q.x * 2.6 + q.y * 0.8, q.y * 1.1 - q.x * 0.6) + vec2(t * 0.4, -t * 0.25));
    float peak = vCrest + (n1 - 0.5) * 0.06;
    float caps = smoothstep(0.36, 0.52, peak) * smoothstep(0.5, 0.82, n3);
    caps *= (1.0 - vShelter * 0.6) * (1.0 - smoothstep(180.0, 520.0, dist));

    // Shorelines: the quay wall, the beaches, and the breakwater.
    float quay = abs(q.x) < 170.0 ? -q.y : 1e3;
    float beach = abs(q.x) > 168.0 ? (27.5 - q.y) : 1e3;
    float wall = sdBox(q, vec2(105.0, -95.0), vec2(147.0, 6.8));
    float shore = min(min(quay, beach), wall);
    float surge = 0.5 + 0.5 * sin(t * 1.4 - shore * 0.9 + n1 * 4.0);
    float shoreFoam = (1.0 - smoothstep(0.0, 2.2 + surge * 2.5, shore)) * smoothstep(0.25, 0.6, n2 + surge * 0.3);
    shoreFoam = max(shoreFoam, (1.0 - smoothstep(0.0, 0.9, shore)) * 0.9);

    // Ship wakes: a Kelvin V spreading from the stern, churned water down the
    // middle, and a bow wave rolling along the hull.
    float wake = 0.0;
    for (int i = 0; i < ${MAX_WAKES}; i++) {
      vec4 a = uWakeA[i];
      vec4 b = uWakeB[i];
      if (b.x <= 0.001) continue;
      vec2 rel = q - a.xy;
      float along = -(rel.x * a.z + rel.y * a.w);       // + behind the stern
      float side = -rel.x * a.w + rel.y * a.z;
      float halfBeam = b.y;
      if (along > 0.0) {
        float arm = abs(abs(side) - along * 0.36 - halfBeam * 0.6);
        float v = (1.0 - smoothstep(0.0, 1.2 + along * 0.04, arm)) * (1.0 - smoothstep(30.0, 190.0, along));
        float trail = (1.0 - smoothstep(halfBeam * 0.4, halfBeam * 0.9 + along * 0.05, abs(side))) * (1.0 - smoothstep(10.0, 150.0, along));
        wake = max(wake, b.x * max(v * smoothstep(0.3, 0.65, n2), trail * smoothstep(0.2, 0.7, n2 + n1 * 0.4)));
      } else if (along > -b.z) {
        float hull = abs(side) - halfBeam;
        float bowness = smoothstep(-b.z * 0.55, -b.z, along);
        float rolls = (1.0 - smoothstep(0.0, 1.0 + bowness * 3.0, hull)) * step(-0.5, hull);
        wake = max(wake, b.x * rolls * (0.35 + bowness * 0.65) * smoothstep(0.2, 0.55, n2));
      }
    }

    float foam = clamp(max(max(caps * 0.85, shoreFoam), wake), 0.0, 1.0);
    vec3 foamCol = mix(vec3(0.82, 0.88, 0.92), vec3(1.0), lambert) * (uAmbient * 0.7 + uSunStrength * 0.3);
    col = mix(col, foamCol, foam);

    float alpha = mix(0.58, 0.97, fresnel);
    alpha = max(alpha, foam);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

export class Water {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly deep = new THREE.Color();
  private readonly shallow = new THREE.Color();

  constructor() {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWaves: { value: WAVES.map(([d, l, s]) => new THREE.Vector3(d, l, s)) },
        uDeep: { value: new THREE.Color(0x0a5a8c) },
        uShallow: { value: new THREE.Color(0x1fd1d8) },
        uHorizon: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uSunStrength: { value: 1 },
        uAmbient: { value: 1 },
        uWakeA: { value: Array.from({ length: MAX_WAKES }, () => new THREE.Vector4()) },
        uWakeB: { value: Array.from({ length: MAX_WAKES }, () => new THREE.Vector4()) },
      },
    ]);
    // Two materials, one set of uniforms: the fine grid clips itself to a
    // circle so it never overlaps the horizon ring.
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
      defines: { CLIP_OUTER: 1 },
    });
    const farMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
    });

    // Fine grid where the swell is, coarse ring out to the horizon.
    const nearGeo = new THREE.PlaneGeometry(1500, 1500, 300, 300);
    nearGeo.rotateX(-Math.PI / 2);
    const near = new THREE.Mesh(nearGeo, this.material);
    near.renderOrder = 1;
    near.frustumCulled = false;

    const farGeo = new THREE.RingGeometry(747.6, 3600, 128, 1);
    farGeo.rotateX(-Math.PI / 2);
    const far = new THREE.Mesh(farGeo, farMaterial);
    far.renderOrder = 1;

    // The seabed, so looking through the water finds something blue-green
    // rather than the void. Sandy in the shallows by the beaches.
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x167a9a }),
    );
    bed.position.y = -16;
    this.group.add(bed, near, far);
  }

  update(t: number, sky: Sky, lightDir: THREE.Vector3, lightStrength: number) {
    const u = this.uniforms;
    u.uTime.value = t;
    // The palette's water colour becomes the shallow tint; deep is a darker,
    // bluer version of it.
    this.shallow.setHex(sky.water).offsetHSL(-0.02, 0.05, 0.08);
    this.deep.setHex(sky.water).offsetHSL(0.03, 0.05, -0.09);
    (u.uShallow.value as THREE.Color).copy(this.shallow);
    (u.uDeep.value as THREE.Color).copy(this.deep);
    (u.uHorizon.value as THREE.Color).setHex(sky.horizon);
    (u.uZenith.value as THREE.Color).setHex(sky.zenith);
    (u.uSunDir.value as THREE.Vector3).copy(lightDir);
    (u.uSunColor.value as THREE.Color).setHex(sky.sun);
    u.uSunStrength.value = lightStrength;
    u.uAmbient.value = 0.55 + sky.hemiIntensity * 0.35;
  }

  /**
   * Register a moving hull so the sea draws its wake.
   * @param stern  world x/z of the stern
   * @param heading radians, the direction she is travelling
   */
  setWake(slot: number, sternX: number, sternZ: number, heading: number, strength: number, halfBeam: number, length: number) {
    const a = (this.uniforms.uWakeA.value as THREE.Vector4[])[slot];
    const b = (this.uniforms.uWakeB.value as THREE.Vector4[])[slot];
    a.set(sternX, sternZ, Math.cos(heading), Math.sin(heading));
    b.set(strength, halfBeam, length, 0);
  }

  /** Surface height at a world point, matching the shader. For floating things. */
  heightAt(x: number, z: number, t: number): number {
    const scale = waveScale(x, z);
    let y = 0;
    for (const [dir, length, steepness] of WAVES) {
      const k = (Math.PI * 2) / length;
      const c = Math.sqrt(G / k) * TIME_SCALE;
      const s = steepness * scale;
      const f = k * (Math.cos(dir) * x + Math.sin(dir) * z - c * t);
      y += (s / k) * Math.sin(f);
    }
    return y;
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
