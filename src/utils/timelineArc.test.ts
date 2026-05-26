import { describe, expect, it } from 'vitest';
import { calcArcHeight, calcLayeredArcHeight, sortArcsByWidth } from './timelineArc';

describe('timelineArc utils', () => {
  // Arcs intentionally use a uniform height (rowHeight * 0.55, clamped to a
  // minimum of 6) regardless of span width or layer index — see commit b808fe6
  // "fix: use uniform arc height for all timeline arcs".
  it('calcArcHeight returns uniform rowHeight-based height, ignoring arcWidth', () => {
    expect(calcArcHeight(4, 28)).toBeCloseTo(15.4);
    expect(calcArcHeight(160, 28)).toBeCloseTo(15.4);
    expect(calcArcHeight(4, 28)).toBe(calcArcHeight(160, 28));
  });

  it('calcArcHeight clamps to a minimum of 6 for small rowHeight', () => {
    // 10 * 0.55 = 5.5 → clamped up to the 6px minimum
    expect(calcArcHeight(40, 10)).toBe(6);
  });

  it('calcLayeredArcHeight returns the same height for every layer', () => {
    const h0 = calcLayeredArcHeight(0, 3, 28);
    const h1 = calcLayeredArcHeight(1, 3, 28);
    const h2 = calcLayeredArcHeight(2, 3, 28);
    expect(h0).toBe(h1);
    expect(h1).toBe(h2);
    expect(h0).toBeCloseTo(15.4);
  });

  it('sortArcsByWidth sorts widest arcs first', () => {
    const sorted = sortArcsByWidth([
      { id: 'a', width: 20 },
      { id: 'b', width: 80 },
      { id: 'c', width: 40 },
    ]);

    expect(sorted.map(item => item.id)).toEqual(['b', 'c', 'a']);
  });
});
