import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatFullDateTime, formatRelativeTime, wasUpdated } from './timeFormat';

describe('timeFormat utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formatRelativeTime returns localized relative labels', () => {
    const value = formatRelativeTime('2026-04-02T09:55:00.000Z');

    expect(value).toContain('phút');
    expect(value).toContain('trước');
  });

  it('formatFullDateTime returns a readable timestamp', () => {
    expect(formatFullDateTime('2026-04-02T10:20:30')).toBe('02/04/2026 10:20:30');
  });

  it('returns fallback label when timestamp is empty or invalid', () => {
    expect(formatRelativeTime(undefined)).toBe('Không có dữ liệu');
    expect(formatFullDateTime('not-a-date')).toBe('Không có dữ liệu');
  });

  it('wasUpdated only returns true when created and updated differ', () => {
    expect(wasUpdated('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:00.000Z')).toBe(false);
    expect(wasUpdated('2026-04-02T09:00:00.000Z', '2026-04-02T10:00:00.000Z')).toBe(true);
    expect(wasUpdated(undefined, '2026-04-02T10:00:00.000Z')).toBe(false);
  });
});
