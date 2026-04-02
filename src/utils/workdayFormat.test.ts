import { describe, expect, it } from 'vitest';
import { formatWorkdayDuration } from './workdayFormat';

describe('formatWorkdayDuration', () => {
  it('formats short durations in days', () => {
    expect(formatWorkdayDuration(0)).toBe('0d');
    expect(formatWorkdayDuration(1)).toBe('1d');
    expect(formatWorkdayDuration(4)).toBe('4d');
  });

  it('formats exact work weeks', () => {
    expect(formatWorkdayDuration(5)).toBe('1w');
    expect(formatWorkdayDuration(10)).toBe('2w');
  });

  it('formats mixed week and day durations', () => {
    expect(formatWorkdayDuration(6)).toBe('1w 1d');
    expect(formatWorkdayDuration(13)).toBe('2w 3d');
  });
});
