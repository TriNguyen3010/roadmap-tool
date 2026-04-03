import { describe, expect, it } from 'vitest';
import { normalizeItemStatus, STATUS_OPTIONS } from './roadmap';

describe('normalizeItemStatus', () => {
  it('accepts all 4 new generic statuses as-is', () => {
    expect(normalizeItemStatus('To do')).toBe('To do');
    expect(normalizeItemStatus('In progress')).toBe('In progress');
    expect(normalizeItemStatus('Pending')).toBe('Pending');
    expect(normalizeItemStatus('Done')).toBe('Done');
  });

  it('accepts existing team statuses unchanged', () => {
    expect(normalizeItemStatus('BA Start')).toBe('BA Start');
    expect(normalizeItemStatus('FE Done')).toBe('FE Done');
    expect(normalizeItemStatus('QC Done - Pro')).toBe('QC Done - Pro');
    expect(normalizeItemStatus('Not Started')).toBe('Not Started');
    expect(normalizeItemStatus('None')).toBe('None');
  });

  it('still applies legacy rename map', () => {
    expect(normalizeItemStatus('Dev Done')).toBe('FE Done');
    expect(normalizeItemStatus('Done - Prod Env')).toBe('QC Done - Pro');
    expect(normalizeItemStatus('BA In Progress')).toBe('BA Start');
    expect(normalizeItemStatus('Dev In Progress')).toBe('FE Start');
  });

  it('maps old "In Progress" (capital P) to FE Start', () => {
    expect(normalizeItemStatus('In Progress')).toBe('FE Start');
  });

  it('returns Not Started for unrecognized values', () => {
    expect(normalizeItemStatus('garbage')).toBe('Not Started');
    expect(normalizeItemStatus('Unknown Status')).toBe('Not Started');
  });

  it('returns None for empty/null/undefined', () => {
    expect(normalizeItemStatus('')).toBe('None');
    expect(normalizeItemStatus(null)).toBe('None');
    expect(normalizeItemStatus(undefined)).toBe('None');
  });
});

describe('STATUS_OPTIONS', () => {
  it('includes all 4 generic statuses', () => {
    expect(STATUS_OPTIONS).toContain('To do');
    expect(STATUS_OPTIONS).toContain('In progress');
    expect(STATUS_OPTIONS).toContain('Pending');
    expect(STATUS_OPTIONS).toContain('Done');
  });

  it('still includes existing team statuses', () => {
    expect(STATUS_OPTIONS).toContain('BA Start');
    expect(STATUS_OPTIONS).toContain('FE Done');
    expect(STATUS_OPTIONS).toContain('QC Done - Pro');
    expect(STATUS_OPTIONS).toContain('Not Started');
  });
});
