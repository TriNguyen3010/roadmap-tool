import { describe, expect, it } from 'vitest';
import {
    VERSION_CONFLICT_CODE,
    buildConflictDraftStorageKey,
    buildRoadmapChannelName,
    buildVersionConflictPayload,
    isMatchingVersion,
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
        expect(isMatchingVersion(null, null)).toBe(true);
        expect(isMatchingVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:01.000Z')).toBe(false);
        expect(isMatchingVersion(null, '2026-04-02T10:00:00.000Z')).toBe(false);
    });

    it('builds a standard conflict payload', () => {
        expect(buildVersionConflictPayload('2026-04-02T10:00:00.000Z')).toEqual({
            error: 'Conflict',
            code: VERSION_CONFLICT_CODE,
            serverVersion: '2026-04-02T10:00:00.000Z',
            message: 'Roadmap da duoc cap nhat boi nguoi khac. Vui long tai ban moi nhat truoc khi luu tiep.',
        });
    });

    it('builds stable storage and channel keys', () => {
        expect(buildConflictDraftStorageKey('abc', 'tri@example.com')).toBe('roadmap-conflict-draft:abc:tri@example.com');
        expect(buildRoadmapChannelName('abc')).toBe('roadmap-sync:abc');
    });
});
