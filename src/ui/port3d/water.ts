import * as THREE from 'three';

/** Radius around the harbour where the sea actually moves. Beyond it the
 *  water is a flat ring that the fog swallows. */
const NEAR_SIZE = 760;
const CALM_FROM = 260;
const CALM_TO = 360;

const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  float waveH(vec2 p) {
    float calm = 1.0 - smoothstep(${CALM_FROM.toFixed(1)}, ${CALM_TO.toFixed(1)}, length(p));
    float h = sin(p.x * 0.055 + uTime * 0.9) * 0.32
            + sin(p.y * 0.07 - uTime * 1.15 + p.x * 0.02) * 0.26
            + sin((p.x + p.y) * 0.13 + uTime * 1.7) * 0.12;
    return h * calm;
  }
`;

/**
 * The sea. A standard lit material with the waves pushed in by the vertex
 * shader, so it takes sun, moon, lamp light and ship shadows like everything
 * else — and costs nothing on the CPU per frame.
 */
export class Water {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly farMaterial: THREE.MeshStandardMaterial;
  private readonly time = { value: 0 };

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      color: 0x12c0dc,
      roughness: 0.22,
      metalness: 0.08,
    });
    const time = this.time;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader =
        WAVE_GLSL +
        'varying float vWaveH;\n' +
        shader.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            /* glsl */ `
            float hx = waveH(position.xy + vec2(0.6, 0.0)) - waveH(position.xy - vec2(0.6, 0.0));
            float hy = waveH(position.xy + vec2(0.0, 0.6)) - waveH(position.xy - vec2(0.0, 0.6));
            vec3 objectNormal = normalize(vec3(-hx / 1.2, -hy / 1.2, 1.0));
            #ifdef USE_TANGENT
              vec3 objectTangent = vec3(tangent.xyz);
            #endif`,
          )
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `
            vWaveH = waveH(position.xy);
            vec3 transformed = vec3(position.xy, vWaveH);`,
          );
      shader.fragmentShader =
        'varying float vWaveH;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          diffuseColor.rgb += vec3(0.07, 0.09, 0.09) * smoothstep(0.35, 0.65, vWaveH);`,
        );
    };

    const near = new THREE.Mesh(new THREE.PlaneGeometry(NEAR_SIZE, NEAR_SIZE, 200, 200), this.material);
    near.rotation.x = -Math.PI / 2;
    near.receiveShadow = true;

    this.farMaterial = new THREE.MeshStandardMaterial({ color: 0x12c0dc, roughness: 0.3 });
    const far = new THREE.Mesh(new THREE.RingGeometry(NEAR_SIZE / 2 - 2, 3200, 64, 1), this.farMaterial);
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.25;

    this.group.add(near, far);
  }

  update(t: number, colour: number) {
    this.time.value = t;
    this.material.color.setHex(colour);
    this.farMaterial.color.setHex(colour);
  }

  /** Surface height at a world point, matching the shader. For bobbing boats. */
  heightAt(x: number, z: number, t: number): number {
    // The plane is rotated -90 degrees about x, so its local y is world -z.
    const px = x;
    const py = -z;
    const calm = 1 - smooth(CALM_FROM, CALM_TO, Math.hypot(px, py));
    const h =
      Math.sin(px * 0.055 + t * 0.9) * 0.32 +
      Math.sin(py * 0.07 - t * 1.15 + px * 0.02) * 0.26 +
      Math.sin((px + py) * 0.13 + t * 1.7) * 0.12;
    return h * calm;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
