import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CAMERA_LIMITS, HarbourRuntime } from './harbourRuntime';
import { PortOverlays, useSightingPrompt } from './PortOverlays';
import { PortScene } from './PortScene';
import type { PortViewProps } from './PortView';

/**
 * The explorable 3D harbour (web). Drag to pan, scroll or pinch to zoom,
 * right-drag or two-finger twist to orbit. The apps draw the same harbour
 * through PortView.native.tsx; what the two share is in harbourRuntime.ts.
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
  const runtimeRef = useRef<HarbourRuntime | null>(null);
  const [failed, setFailed] = useState(false);
  const prompt = useSightingPrompt();
  const showSighting = useRef(prompt.show);
  showSighting.current = prompt.show;

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

    const runtime = new HarbourRuntime();
    runtimeRef.current = runtime;
    const { world, camera } = runtime;
    world.setLowPower(lowPower);

    const controls = new MapControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.minDistance = CAMERA_LIMITS.minDistance;
    controls.maxDistance = CAMERA_LIMITS.maxDistance;
    controls.minPolarAngle = CAMERA_LIMITS.minPolarAngle;
    controls.maxPolarAngle = CAMERA_LIMITS.maxPolarAngle;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 1.2;
    runtime.attach(controls);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      runtime.setAspect(w / h);
    };
    resize();
    runtime.goHome();

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const stopFlight = () => runtime.stopFlight();
    controls.addEventListener('start', stopFlight);

    // Test hook for screenshots and debugging, only with ?debug in the URL.
    if (typeof location !== 'undefined' && location.search.includes('debug')) {
      (window as unknown as Record<string, unknown>).__harbour = { camera, controls, world };
    }

    let raf = 0;
    let last = performance.now();
    let lastPayout = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowPerf = performance.now();
      const dt = Math.min(0.1, (nowPerf - last) / 1000);
      last = nowPerf;

      const seen = runtime.step(propsRef.current, dt);
      if (seen) showSighting.current(seen);
      renderer.render(world.scene, camera);

      // Floating payout, projected from the berth onto the screen.
      const el = payoutRef.current;
      if (el) {
        const p = runtime.payout(host.clientWidth, host.clientHeight);
        if (p) {
          if (p.label !== lastPayout) {
            el.textContent = p.label;
            lastPayout = p.label;
          }
          el.style.opacity = String(p.opacity);
          el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
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
      runtime.dispose();
      runtimeRef.current = null;
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
      <PortOverlays
        sighting={prompt.sighting}
        hint="Drag to explore · scroll or pinch to zoom · right-drag to turn"
        onLook={() => {
          runtimeRef.current?.lookAt();
          prompt.clear();
        }}
        onRecenter={() => runtimeRef.current?.recenter()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#8fd8ff' },
});
