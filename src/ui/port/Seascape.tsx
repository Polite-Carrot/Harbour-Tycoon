import { memo } from 'react';
import { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { SCENE, portPalette, wavePath } from './geometry';

/** Fixed star field — positions are literal so the sky never flickers. */
const STARS = [
  [18, 14, 0.9], [44, 30, 0.6], [70, 9, 0.7], [96, 24, 0.5], [128, 16, 0.8],
  [152, 36, 0.5], [188, 12, 0.7], [214, 28, 0.6], [242, 18, 0.9], [268, 38, 0.5],
  [292, 11, 0.7], [308, 30, 0.6], [58, 48, 0.4], [176, 50, 0.4], [256, 52, 0.4],
] as const;

/** Distant harbour silhouette: tanks, sheds and a far-off gantry. */
const SKYLINE = 'M0,72 L0,64 L14,64 L14,58 L30,58 L30,64 L48,64 L48,54 L56,54 L56,64 '
  + 'L78,64 L78,60 L96,60 L96,64 L120,64 L120,50 L124,50 L124,64 L140,64 L140,57 '
  + 'L162,57 L162,64 L186,64 L186,52 L190,52 L190,64 L214,64 L214,59 L236,59 L236,64 '
  + 'L258,64 L258,55 L266,55 L266,64 L288,64 L288,61 L306,61 L306,64 L320,64 L320,72 Z';

export const Seascape = memo(function Seascape({ t, port }: { t: number; port: number }) {
  const { width, height, horizonY, quayY } = SCENE;
  const pal = portPalette(port);

  return (
    <G>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pal.skyTop} />
          <Stop offset="0.62" stopColor={pal.skyMid} />
          <Stop offset="1" stopColor={pal.skyLow} />
        </LinearGradient>
        <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pal.seaTop} />
          <Stop offset="1" stopColor={pal.seaLow} />
        </LinearGradient>
        <LinearGradient id="moonGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffe8a3" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#ffe8a3" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={width} height={horizonY} fill="url(#sky)" />

      {STARS.map(([x, y, o], i) => (
        <Circle key={i} cx={x} cy={y} r={o > 0.7 ? 1 : 0.7} fill="#ffffff" opacity={o} />
      ))}

      <Circle cx={222} cy={30} r={17} fill="url(#moonGlow)" />
      <Circle cx={222} cy={30} r={8.5} fill="#ffe8a3" opacity={0.92} />
      <Circle cx={217} cy={27} r={7} fill={pal.skyTop} opacity={0.95} />

      <G y={horizonY - 72}>
        <Path d={SKYLINE} fill="#0c1c30" opacity={0.85} />
      </G>

      <Rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#sea)" />

      {/* Moonlight on the water, then three wave bands drifting at different
          speeds to give the sea some depth. */}
      <Rect x={214} y={horizonY} width={16} height={quayY - horizonY} fill="#ffe8a3" opacity={0.05} />

      <Path d={wavePath(horizonY + 12, 1.1, 96, t * 0.55)} stroke="#5b8ab0" strokeWidth={1} fill="none" opacity={0.4} />
      <Path d={wavePath(horizonY + 28, 1.5, 74, -t * 0.75 + 1.2)} stroke="#6f9fc4" strokeWidth={1.1} fill="none" opacity={0.34} />
      <Path d={wavePath(horizonY + 46, 1.9, 58, t * 0.95 + 2.4)} stroke="#87b3d4" strokeWidth={1.2} fill="none" opacity={0.28} />
      <Path d={wavePath(horizonY + 60, 2.2, 46, -t * 1.15 + 0.6)} stroke="#9cc4e0" strokeWidth={1.2} fill="none" opacity={0.22} />
      <Path d={wavePath(horizonY + 76, 2.5, 40, t * 1.3 + 3.1)} stroke="#b0d3ea" strokeWidth={1.3} fill="none" opacity={0.18} />
    </G>
  );
});
