import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { formatMoney } from '../../sim/format';
import { HOME_OFFSET, HOME_TARGET, HarbourWorld } from '../port3d/HarbourWorld';
import { PortScene } from './PortScene';
import type { PortViewProps } from './PortView';

/** How far the camera may wander from the berth, in world units. */
const BOUNDS = { minX: -260, maxX: 300, minZ: -200, maxZ: 220 };
const RECENTER_SECONDS = 0.9;
const HINT_MS = 6000;

/**
 * The explorable 3D harbour (web). Drag to pan, scroll or pinch to zoom,
 * right-drag or two-finger twist to orbit.
 *
 * Three.js owns the canvas and its own render loop. React only mounts it and
 * hands over the latest props through a ref, so the scene runs at full frame
 * rate without re-rendering the component tree.
 */
export function PortView(props: PortViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const payoutRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const recenterRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    // Small screens are usually phones: trade a little sharpness for frame rate.
    const lowPower = Math.min(window.innerWidth, window.innerHeight) < 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    host.appendChild(canvas);

    const world = new HarbourWorld();
    world.setLowPower(lowPower);
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);

    const controls = new MapControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.minDistance = 30;
    controls.maxDistance = 420;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = 1.38;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 1.2;

    // Tall phones see less width, so the opening shot stands further back.
    const homeFor = (aspect: number) => {
      const pull = aspect < 1 ? Math.min(1.45, 0.8 / aspect) : 1;
      return HOME_TARGET.clone().add(HOME_OFFSET.clone().multiplyScalar(pull));
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    camera.position.copy(homeFor(camera.aspect));
    controls.target.copy(HOME_TARGET);
    controls.update();

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Smoothly fly back to the berth.
    let flight: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; t: number } | null = null;
    recenterRef.current = () => {
      flight = {
        from: camera.position.clone(),
        to: homeFor(camera.aspect),
        fromT: controls.target.clone(),
        t: 0,
      };
    };
    const stopFlight = () => {
      flight = null;
    };
    controls.addEventListener('start', stopFlight);

    let raf = 0;
    let last = performance.now();
    let lastPayout = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowPerf = performance.now();
      const dt = Math.min(0.1, (nowPerf - last) / 1000);
      last = nowPerf;

      if (flight) {
        flight.t = Math.min(1, flight.t + dt / RECENTER_SECONDS);
        const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
        camera.position.lerpVectors(flight.from, flight.to, e);
        controls.target.lerpVectors(flight.fromT, HOME_TARGET, e);
        if (flight.t >= 1) flight = null;
      }
      controls.update();

      // Keep the view over the harbour: clamp the target, and drag the camera
      // along with it so panning into a wall simply stops.
      const tgt = controls.target;
      const cx = THREE.MathUtils.clamp(tgt.x, BOUNDS.minX, BOUNDS.maxX);
      const cz = THREE.MathUtils.clamp(tgt.z, BOUNDS.minZ, BOUNDS.maxZ);
      if (cx !== tgt.x || cz !== tgt.z || tgt.y !== HOME_TARGET.y) {
        camera.position.x += cx - tgt.x;
        camera.position.z += cz - tgt.z;
        camera.position.y += HOME_TARGET.y - tgt.y;
        tgt.set(cx, HOME_TARGET.y, cz);
      }
      if (camera.position.y < 4) camera.position.y = 4;

      world.update(propsRef.current, Date.now(), dt, camera);
      renderer.render(world.scene, camera);

      // Floating payout, projected from the berth onto the screen.
      const el = payoutRef.current;
      if (el) {
        const p = world.payout;
        const v = p.position.clone().project(camera);
        const onScreen = p.visible && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
        if (onScreen) {
          const label = `+${formatMoney(p.amount)}`;
          if (label !== lastPayout) {
            el.textContent = label;
            lastPayout = label;
          }
          const x = ((v.x + 1) / 2) * host.clientWidth;
          const y = ((1 - v.y) / 2) * host.clientHeight;
          el.style.opacity = String(Math.min(1, (1 - p.p) * 1.6));
          el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${1 + p.p * 0.25})`;
          el.style.visibility = 'visible';
        } else {
          el.style.visibility = 'hidden';
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.removeEventListener('start', stopFlight);
      controls.dispose();
      world.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  if (failed) return <PortScene {...props} />;

  return (
    <View style={styles.frame}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      <div
        ref={payoutRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          color: '#ffd23f',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          fontWeight: 900,
          fontSize: 26,
          WebkitTextStroke: '1.5px #0b3d6b',
          textShadow: '0 3px 0 #0b3d6b, 0 6px 14px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
          willChange: 'transform, opacity',
        }}
      />

      {hint && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Drag to explore · scroll or pinch to zoom · right-drag to turn</Text>
        </View>
      )}

      <Pressable
        onPress={() => recenterRef.current()}
        accessibilityRole="button"
        accessibilityLabel="Back to the berth"
        style={({ pressed }) => [styles.recenter, pressed && styles.recenterPressed]}
      >
        <Text style={styles.recenterIcon}>⌖</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#8fd8ff' },
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
