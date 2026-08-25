/**
 * Icon path geometry. Pure maths so the shapes are generated rather than
 * pasted as magic strings, and can be checked by a test.
 */

/**
 * A cog outline with a hole through the middle.
 *
 * Returns a single path with two subpaths — the toothed rim and an inner
 * circle — so rendering it with fillRule="evenodd" punches out the hub
 * instead of needing a second shape painted in the background colour.
 */
export function gearPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  hub: number,
  teeth = 8,
): string {
  const step = (Math.PI * 2) / teeth;
  const half = step * 0.19; // half-width of a tooth
  const gap = step * 0.1; // shoulder between tooth and valley

  const at = (r: number, a: number) =>
    `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;

  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    d += `${i === 0 ? 'M' : 'L'}${at(outer, a - half)}`;
    d += `L${at(outer, a + half)}`;
    d += `L${at(inner, a + half + gap)}`;
    d += `L${at(inner, a + step - half - gap)}`;
  }
  d += 'Z';

  // Hub, as two half-arcs so it closes cleanly.
  d += `M${cx + hub},${cy}`;
  d += `A${hub},${hub} 0 1 0 ${cx - hub},${cy}`;
  d += `A${hub},${hub} 0 1 0 ${cx + hub},${cy}Z`;

  return d;
}
