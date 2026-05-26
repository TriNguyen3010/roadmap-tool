import { describe, it, expect } from 'vitest';
import { parseLastDump } from './lastDump';

describe('parseLastDump', () => {
  it('parses the new aggregate shape', () => {
    const raw = {
      timestamp: '2026-05-26T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      elapsed: '180s',
      summary: { total: 5, success: 5, failed: 0 },
      roadmaps: [
        { roadmapId: 'a833', releaseName: 'Q2', status: 'success', fileSize: '368K', elapsed: '45s' },
        { roadmapId: 'b911', releaseName: 'Q3', status: 'failed', error: 'dump_failed' },
      ],
    };
    const parsed = parseLastDump(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('parseLastDump returned null');
    expect(parsed.kind).toBe('aggregate');
    if (parsed.kind !== 'aggregate') throw new Error('narrow');
    expect(parsed.summary.total).toBe(5);
    expect(parsed.roadmaps).toHaveLength(2);
    expect(parsed.roadmaps[0].roadmapId).toBe('a833');
    expect(parsed.timestampLocal).toBe('2026-05-26 06:03:51');
  });

  it('parses the legacy single-roadmap shape', () => {
    const raw = {
      timestamp: '2026-05-25T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      roadmapId: 'a833',
      status: 'success',
      fileSize: '368K',
      elapsed: '45s',
    };
    const parsed = parseLastDump(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('parseLastDump returned null');
    expect(parsed.kind).toBe('legacy');
    if (parsed.kind !== 'legacy') throw new Error('narrow');
    expect(parsed.roadmapId).toBe('a833');
    expect(parsed.status).toBe('success');
    expect(parsed.fileSize).toBe('368K');
  });

  it('parses the discovery_failed shape', () => {
    const raw = {
      timestamp: '2026-05-26T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      elapsed: '5s',
      status: 'discovery_failed',
      error: 'Could not fetch roadmap list',
      summary: { total: 0, success: 0, failed: 0 },
      roadmaps: [],
    };
    const parsed = parseLastDump(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('parseLastDump returned null');
    expect(parsed.kind).toBe('discovery_failed');
    if (parsed.kind !== 'discovery_failed') throw new Error('narrow');
    expect(parsed.error).toBe('Could not fetch roadmap list');
  });

  it('returns null for null/undefined/empty input', () => {
    expect(parseLastDump(null)).toBeNull();
    expect(parseLastDump(undefined)).toBeNull();
    expect(parseLastDump({})).toBeNull();
  });

  it('finds a roadmap by id in aggregate shape', () => {
    const raw = {
      timestamp: 't', timestampLocal: 'tl', elapsed: '10s',
      summary: { total: 2, success: 2, failed: 0 },
      roadmaps: [
        { roadmapId: 'a', releaseName: 'A', status: 'success', fileSize: '1K', elapsed: '5s' },
        { roadmapId: 'b', releaseName: 'B', status: 'success', fileSize: '2K', elapsed: '5s' },
      ],
    };
    const parsed = parseLastDump(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('parseLastDump returned null');
    if (parsed.kind !== 'aggregate') throw new Error('narrow');
    const found = parsed.roadmaps.find(r => r.roadmapId === 'b');
    expect(found?.releaseName).toBe('B');
  });
});
