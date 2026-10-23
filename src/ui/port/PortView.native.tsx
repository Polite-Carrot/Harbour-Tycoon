import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import * as THREE from 'three';
import { HarbourRuntime } from './harbourRuntime';
import { PortOverlays, useSightingPrompt } from './PortOverlays';
import { PortScene } from './PortScene';
import type { PortViewProps } from './PortView';
import { TouchRig } from './touchRig';

/**
 * The explorable 3D harbour in the iOS and Android apps: the same world as
 * the web (harbourRuntime.ts), drawn through expo-gl's native WebGL2 view.
 * Drag to explore, pinch to zoom, twist to turn, two fingers up or down to
 * tilt. If the device cannot give a GL context, it falls back to the flat
 * harbour (PortScene).
 */

/** Below this many points on the short side it's a phone: smaller shadow map. */
const PHONE_SIZE = 600;

export function PortView(props: PortViewProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const runtimeRef = useRef<HarbourRuntime | null>(null);
  const rigRef = useRef<TouchRig | null>(null);
  const size = useRef({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const prompt = useSightingPrompt();
  const showSighting = useRef(prompt.show);
  showSighting.current = prompt.show;
  const stop = useRef<() => void>(() => {});

  // The floating "+$" payout: moved every frame through Animated values (no
  // React render), with the label re-rendered only when it changes.
  const payout = useMemo(
    () => ({ x: new Animated.Value(0), y: new Animated.Value(0), opacity: new Animated.Value(0), scale: new Animated.Value(1) }),
    [],
  );
  const [payoutLabel, setPayoutLabel] = useState('');

  useEffect(() => () => stop.current(), []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // expo-gl warns on every texture upload for these browser-only settings,
    // which mean nothing natively: let them pass silently.
    const pixelStorei = gl.pixelStorei.bind(gl);
    gl.pixelStorei = (pname: number, param: number | boolean) => {
      if (pname === 0x9241 /* UNPACK_PREMULTIPLY_ALPHA_WEBGL */ || pname === 0x9243 /* UNPACK_COLORSPACE_CONVERSION_WEBGL */) return;
      pixelStorei(pname, param as number);
    };

    // three.js asks its canvas for little beyond a size and event hooks.
    const canvas = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      clientWidth: gl.drawingBufferWidth,
      clientHeight: gl.drawingBufferHeight,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const runtime = new HarbourRuntime();
    const rig = new TouchRig(runtime.camera);
    runtime.attach(rig);
    runtimeRef.current = runtime;
    rigRef.current = rig;
    const screen = Dimensions.get('window');
    runtime.world.setLowPower(Math.min(screen.width, screen.height) < PHONE_SIZE);

    // The drawing buffer is in pixels; the camera only needs its shape.
    let bufW = 0;
    let bufH = 0;
    const fit = () => {
      if (gl.drawingBufferWidth === bufW && gl.drawingBufferHeight === bufH) return;
      bufW = gl.drawingBufferWidth;
      bufH = gl.drawingBufferHeight;
      renderer.setSize(bufW, bufH, false);
      runtime.setAspect(bufW / Math.max(1, bufH));
    };
    fit();
    runtime.goHome();

    let raf = 0;
    let last = performance.now();
    let lastLabel = '';
    let alive = true;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const nowPerf = performance.now();
      const dt = Math.min(0.1, (nowPerf - last) / 1000);
      last = nowPerf;
      fit();

      const seen = runtime.step(propsRef.current, dt);
      if (seen) showSighting.current(seen);
      renderer.render(runtime.world.scene, runtime.camera);
      gl.endFrameEXP();

      const p = runtime.payout(size.current.width, size.current.height);
      if (p) {
        if (p.label !== lastLabel) {
          lastLabel = p.label;
          setPayoutLabel(p.label);
        }
        payout.x.setValue(p.x);
        payout.y.setValue(p.y);
        payout.opacity.setValue(p.opacity);
        payout.scale.setValue(p.scale);
      } else {
        payout.opacity.setValue(0);
      }
    };
    raf = requestAnimationFrame(loop);

    stop.current = () => {
      alive = false;
      cancelAnimationFrame(raf);
      runtime.dispose();
      renderer.dispose();
      runtimeRef.current = null;
      rigRef.current = null;
    };
  };

  // Touches: one finger drags; two pinch, twist and tilt. The baseline is
  // reset whenever the number of fingers changes, so nothing jumps.
  const gesture = useRef<{ count: number; x: number; y: number; dist: number; angle: number } | null>(null);
  const responder = useMemo(() => {
    const read = (e: GestureResponderEvent) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const [a, b] = [t[0], t[1]];
        return {
          count: 2,
          x: (a.pageX + b.pageX) / 2,
          y: (a.pageY + b.pageY) / 2,
          dist: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY),
          angle: Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX),
        };
      }
      const a = t[0] ?? e.nativeEvent;
      return { count: 1, x: a.pageX, y: a.pageY, dist: 0, angle: 0 };
    };
    const move = (e: GestureResponderEvent) => {
      const rig = rigRef.current;
      if (!rig) return;
      const now = read(e);
      const prev = gesture.current;
      gesture.current = now;
      if (!prev || prev.count !== now.count) return;
      const h = size.current.height;
      if (now.count === 1) {
        rig.pan(now.x - prev.x, now.y - prev.y, h);
      } else {
        if (prev.dist > 0 && now.dist > 0) rig.zoom(now.dist / prev.dist);
        let turn = now.angle - prev.angle;
        if (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn < -Math.PI) turn += 2 * Math.PI;
        rig.rotate(turn);
        rig.tilt(now.y - prev.y, h);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        runtimeRef.current?.stopFlight();
        gesture.current = read(e);
      },
      onPanResponderMove: move,
      onPanResponderRelease: () => {
        gesture.current = null;
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
      },
    });
  }, []);

  if (failed) return <PortScene {...props} />;

  return (
    <View
      style={styles.frame}
      onLayout={(e: LayoutChangeEvent) => {
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
      }}
    >
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
        <GLView style={StyleSheet.absoluteFill} msaaSamples={4} onContextCreate={onContextCreate} />
      </View>
      <Animated.Text
        pointerEvents="none"
        style={[
          styles.payout,
          {
            opacity: payout.opacity,
            transform: [{ translateX: payout.x }, { translateY: payout.y }, { translateX: -60 }, { translateY: -18 }, { scale: payout.scale }],
          },
        ]}
      >
        {payoutLabel}
      </Animated.Text>
      <PortOverlays
        sighting={prompt.sighting}
        hint="Drag to explore · pinch to zoom · twist to turn"
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
  payout: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 120,
    textAlign: 'center',
    color: '#ffd23f',
    fontSize: 24,
    fontWeight: '900',
    textShadowColor: '#0b3d6b',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});
