import { describe, expect, it } from 'vitest';
import { calcArcHeight, calcLayeredArcHeight, sortArcsByWidth } from './timelineArc';

describe('timelineArc utils', () => {
  it('calcArcHeight clamps between min and max bounds', () => {
    expect(calcArcHeight(4, 28)).toBe(6);
    expect(calcArcHeight(160, 28)).toBe(18);
  });

  it('calcLayeredArcHeight returns descending heights by layer', () => {
    expect(calcLayeredArcHeight(0, 3, 28)).toBeGreaterThan(calcLayeredArcHeight(1, 3, 28));
    expect(calcLayeredArcHeight(1, 3, 28)).toBeGreaterThan(calcLayeredArcHeight(2, 3, 28));
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
