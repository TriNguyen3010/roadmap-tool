import { describe, expect, it } from 'vitest';
import { normalizeItemStatus, STATUS_OPTIONS } from './roadmap';

describe('normalizeItemStatus', () => {
  it('accepts all 4 new generic statuses as-is', () => {
    expect(normalizeItemStatus('Task To do')).toBe('Task To do');
    expect(normalizeItemStatus('Task In progress')).toBe('Task In progress');
    expect(normalizeItemStatus('Task Pending')).toBe('Task Pending');
    expect(normalizeItemStatus('Task Done')).toBe('Task Done');
  });

  it('accepts existing team statuses unchanged', () => {
    expect(normalizeItemStatus('BA in progress')).toBe('BA in progress');
    expect(normalizeItemStatus('FE Done')).toBe('FE Done');
    expect(normalizeItemStatus('QC Done - Pro')).toBe('QC Done - Pro');
    expect(normalizeItemStatus('Not Started')).toBe('Not Started');
    expect(normalizeItemStatus('None')).toBe('None');
  });

  it('still applies legacy rename map', () => {
    expect(normalizeItemStatus('Dev Done')).toBe('FE Done');
    expect(normalizeItemStatus('Done - Prod Env')).toBe('QC Done - Pro');
    expect(normalizeItemStatus('BA In Progress')).toBe('BA in progress');
    expect(normalizeItemStatus('Dev In Progress')).toBe('FE in progress');
  });

  it('maps old "In Progress" (capital P) to FE in progress', () => {
    expect(normalizeItemStatus('In Progress')).toBe('FE in progress');
  });

  it('normalizes old names to new names via legacy mapping', () => {
    expect(normalizeItemStatus('BA Start')).toBe('BA in progress');
    expect(normalizeItemStatus('PD Start UI/UX')).toBe('PD in progress UI/UX');
    expect(normalizeItemStatus('FE Start')).toBe('FE in progress');
    expect(normalizeItemStatus('To do')).toBe('Task To do');
    expect(normalizeItemStatus('In progress')).toBe('Task In progress');
    expect(normalizeItemStatus('Pending')).toBe('Task Pending');
    expect(normalizeItemStatus('Done')).toBe('Task Done');
  });

  it('passes through non-empty custom values (for RoadmapConfig custom statuses)', () => {
    expect(normalizeItemStatus('Discussing')).toBe('Discussing');
    expect(normalizeItemStatus('Pending => Data comeback')).toBe('Pending => Data comeback');
    expect(normalizeItemStatus('garbage')).toBe('garbage');
    expect(normalizeItemStatus('Unknown Status')).toBe('Unknown Status');
  });

  it('returns None for empty/null/undefined', () => {
    expect(normalizeItemStatus('')).toBe('None');
    expect(normalizeItemStatus(null)).toBe('None');
    expect(normalizeItemStatus(undefined)).toBe('None');
  });
});

describe('STATUS_OPTIONS', () => {
  it('includes all 4 generic statuses', () => {
    expect(STATUS_OPTIONS).toContain('Task To do');
    expect(STATUS_OPTIONS).toContain('Task In progress');
    expect(STATUS_OPTIONS).toContain('Task Pending');
    expect(STATUS_OPTIONS).toContain('Task Done');
  });

  it('still includes existing team statuses', () => {
    expect(STATUS_OPTIONS).toContain('BA in progress');
    expect(STATUS_OPTIONS).toContain('FE Done');
    expect(STATUS_OPTIONS).toContain('QC Done - Pro');
    expect(STATUS_OPTIONS).toContain('Not Started');
  });
});
