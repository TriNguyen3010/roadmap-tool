import { describe, expect, it } from 'vitest';
import {
  ensureReportedPriority,
  removeReportedPriority,
  toggleReportedMode,
} from './reportedMode';

describe('reportedMode utils', () => {
  it('ensureReportedPriority adds Reported only once', () => {
    expect(ensureReportedPriority([])).toEqual(['Reported']);
    expect(ensureReportedPriority(['High'])).toEqual(['High', 'Reported']);
    expect(ensureReportedPriority(['Reported', 'High'])).toEqual(['Reported', 'High']);
  });

  it('removeReportedPriority removes Reported and keeps others', () => {
    expect(removeReportedPriority(['Reported'])).toEqual([]);
    expect(removeReportedPriority(['High', 'Reported'])).toEqual(['High']);
    expect(removeReportedPriority(['High', 'Low'])).toEqual(['High', 'Low']);
  });

  it('toggleReportedMode toggles mode and adjusts priority filter', () => {
    const enter = toggleReportedMode(false, ['High']);
    expect(enter.nextMode).toBe(true);
    expect(enter.nextPriorities).toEqual(['High', 'Reported']);

    const exit = toggleReportedMode(true, ['High', 'Reported']);
    expect(exit.nextMode).toBe(false);
    expect(exit.nextPriorities).toEqual(['High']);
  });
});
