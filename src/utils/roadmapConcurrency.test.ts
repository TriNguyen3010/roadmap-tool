import { describe, expect, it } from 'vitest';
import {
    VERSION_CONFLICT_CODE,
    buildRoadmapChannelName,
    buildVersionConflictPayload,
    getVersionTimestamp,
    isMatchingVersion,
    isVersionNewer,
    normalizeVersion,
} from './roadmapConcurrency';

describe('roadmapConcurrency', () => {
    it('normalizes blank versions to null', () => {
        expect(normalizeVersion(undefined)).toBeNull();
        expect(normalizeVersion(null)).toBeNull();
        expect(normalizeVersion('   ')).toBeNull();
        expect(normalizeVersion(' 2026-04-02T10:00:00.000Z ')).toBe('2026-04-02T10:00:00.000Z');
    });

    it('matches versions only when normalized values are equal', () => {
        expect(isMatchingVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:00.000Z')).toBe(true);
        expect(isMatchingVersion(' 2026-04-02T10:00:00.000Z ', '2026-04-02T10:00:00.000Z')).toBe(true);
        expect(isMatchingVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:00.000+00:00')).toBe(true);
        expect(isMatchingVersion(null, null)).toBe(true);
        expect(isMatchingVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:01.000Z')).toBe(false);
        expect(isMatchingVersion(null, '2026-04-02T10:00:00.000Z')).toBe(false);
    });

    it('extracts comparable timestamps and detects newer versions', () => {
        expect(getVersionTimestamp('2026-04-02T10:00:00.000Z')).toBe(Date.parse('2026-04-02T10:00:00.000Z'));
        expect(getVersionTimestamp('not-a-date')).toBeNull();

        expect(isVersionNewer('2026-04-02T10:00:01.000Z', '2026-04-02T10:00:00.000Z')).toBe(true);
        expect(isVersionNewer('2026-04-02T10:00:00.000+00:00', '2026-04-02T10:00:00.000Z')).toBe(false);
        expect(isVersionNewer('2026-04-02T10:00:00.000Z', null)).toBe(true);
        expect(isVersionNewer(null, '2026-04-02T10:00:00.000Z')).toBe(false);
    });

    it('builds a standard conflict payload', () => {
        expect(buildVersionConflictPayload('2026-04-02T10:00:00.000Z')).toEqual({
            error: 'Conflict',
            code: VERSION_CONFLICT_CODE,
            serverVersion: '2026-04-02T10:00:00.000Z',
            message: 'Roadmap da duoc cap nhat boi nguoi khac. Vui long tai ban moi nhat truoc khi luu tiep.',
        });
    });

    it('builds stable channel key', () => {
        expect(buildRoadmapChannelName('abc')).toBe('roadmap-sync:abc');
    });
});
