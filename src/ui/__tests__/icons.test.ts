import { describe, expect, it } from 'vitest';
import { gearPath } from '../icons';

describe('gear icon', () => {
  const d = gearPath(12, 12, 11, 7.6, 3.6, 8);

  it('produces a finite path with no NaN coordinates', () => {
    expect(d).not.toContain('NaN');
    expect(d.startsWith('M')).toBe(true);
  });

  it('emits two subpaths so evenodd punches out the hub', () => {
    // Rim then hub — without the second subpath the cog renders solid.
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect(d).toContain('A');
  });

  it('draws four points per tooth', () => {
    for (const teeth of [6, 8, 12]) {
      const path = gearPath(12, 12, 11, 7.6, 3.6, teeth);
      const rim = path.slice(0, path.lastIndexOf('M'));
      const points = (rim.match(/[ML]-?[\d.]+,/g) ?? []).length;
      expect(points).toBe(teeth * 4);
    }
  });

  it('keeps every rim point inside the icon box', () => {
    const coords = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
    expect(coords.length).toBeGreaterThan(0);
    for (const [, x, y] of coords) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThanOrEqual(24);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThanOrEqual(24);
    }
  });
});
