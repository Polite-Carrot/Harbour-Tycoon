/** Bright, sunny harbour colours. The 3D scene has its own palette in
 *  port3d/palette.ts; these are for the UI that docks around it. */
export const theme = {
  bg: '#e3f4ff',
  panel: '#ffffff',
  panelAlt: '#fff5d6',
  border: '#b3daf5',
  text: '#0b3d6b',
  textDim: '#4b6f8f',
  accent: '#ff7a1a',
  /** Fills: price pills, highlights. */
  money: '#ffc21a',
  /** Money as text on a light ground. */
  moneyText: '#e07800',
  good: '#11a053',
  disabled: '#9db4c8',
  /** Text on an accent-coloured button. */
  onAccent: '#ffffff',
  /** Overlays sitting on top of the scene. */
  scrim: 'rgba(255,255,255,0.9)',
  scrimEdge: 'rgba(11,61,107,0.18)',
} as const;
