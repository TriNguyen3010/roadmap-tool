import { describe, expect, it } from 'vitest';
import type { RoadmapDocument } from '@/types/roadmap';
import {
    normalizeSharedRoadmapDocument,
    resolveAdminPatchRequest,
    resolveDocumentSaveRequest,
    resolveManagerSaveRequest,
    sanitizeSharedRoadmapDocument,
    validateBaseVersion,
} from './roadmapSaveFlow';

describe('roadmapSaveFlow', () => {
    it('resolves wrapped document save requests', () => {
        const document: RoadmapDocument = {
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            items: [],
        };

        expect(resolveDocumentSaveRequest({
            document,
            baseVersion: ' 2026-04-02T10:00:00.000Z ',
        })).toEqual({
            document,
            baseVersion: '2026-04-02T10:00:00.000Z',
        });
    });

    it('falls back to legacy document save body shape', () => {
        const document: RoadmapDocument = {
            releaseName: 'Legacy',
            startDate: '',
            endDate: '',
            items: [],
        };

        expect(resolveDocumentSaveRequest(document)).toEqual({
            document,
            baseVersion: null,
        });
    });

    it('resolves manager save requests with normalized version and safe changes array', () => {
        expect(resolveManagerSaveRequest({
            changes: [{ itemId: '1', field: 'quickNote', value: 'hello' }],
            baseVersion: ' 2026-04-02T10:00:00.000Z ',
        })).toEqual({
            changes: [{ itemId: '1', field: 'quickNote', value: 'hello' }],
            baseVersion: '2026-04-02T10:00:00.000Z',
        });

        expect(resolveManagerSaveRequest({})).toEqual({
            changes: [],
            baseVersion: null,
        });
    });

    it('resolves admin patch requests for milestones and release metadata', () => {
        expect(resolveAdminPatchRequest({
            kind: 'milestones',
            milestones: [{ id: 'm1', label: 'Week 1', startDate: '2026-04-01', endDate: '2026-04-02', color: '#fff' }],
            baseVersion: ' 2026-04-02T10:00:00.000Z ',
        })).toEqual({
            kind: 'milestones',
            milestones: [{ id: 'm1', label: 'Week 1', startDate: '2026-04-01', endDate: '2026-04-02', color: '#fff' }],
            baseVersion: '2026-04-02T10:00:00.000Z',
        });

        expect(resolveAdminPatchRequest({
            kind: 'release-meta',
            releaseName: ' Roadmap Alpha ',
            baseVersion: null,
        })).toEqual({
            kind: 'release-meta',
            releaseName: ' Roadmap Alpha ',
            baseVersion: null,
        });

        expect(resolveAdminPatchRequest({ kind: 'milestones', milestones: null })).toBeNull();
    });

    it('validates missing and stale baseVersion values', () => {
        expect(validateBaseVersion(null, '2026-04-02T10:00:00.000Z')).toEqual({
            ok: false,
            status: 400,
            payload: { error: 'Missing baseVersion' },
        });

        expect(validateBaseVersion('2026-04-02T09:00:00.000Z', '2026-04-02T10:00:00.000Z')).toEqual({
            ok: false,
            status: 409,
            payload: {
                error: 'Conflict',
                code: 'VERSION_MISMATCH',
                serverVersion: '2026-04-02T10:00:00.000Z',
                message: 'Roadmap da duoc cap nhat boi nguoi khac. Vui long tai ban moi nhat truoc khi luu tiep.',
            },
        });

        expect(validateBaseVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:00.000Z')).toEqual({
            ok: true,
            currentVersion: '2026-04-02T10:00:00.000Z',
        });

        expect(validateBaseVersion('2026-04-02T10:00:00.000Z', '2026-04-02T10:00:00.000+00:00')).toEqual({
            ok: true,
            currentVersion: '2026-04-02T10:00:00.000+00:00',
        });
    });

    it('normalizes shared save documents and strips view settings', () => {
        const document: RoadmapDocument = {
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            settings: {
                beforeMonths: 4,
                afterMonths: 3,
                timelineOnly: true,
            },
            items: [
                {
                    id: 'item-1',
                    name: 'Task',
                    type: 'item',
                    status: 'Task Done',
                    progress: 0,
                },
            ],
        };

        expect(normalizeSharedRoadmapDocument(document)).toEqual({
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            items: [
                {
                    id: 'item-1',
                    name: 'Task',
                    type: 'item',
                    status: 'Task Done',
                    statusMode: 'manual',
                    manualStatus: 'Task Done',
                    progress: 0,
                    priority: undefined,
                    children: undefined,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                },
            ],
        });

        expect(sanitizeSharedRoadmapDocument(document)).toEqual({
            releaseName: 'Roadmap A',
            startDate: '',
            endDate: '',
            items: [
                {
                    id: 'item-1',
                    name: 'Task',
                    type: 'item',
                    status: 'Task Done',
                    progress: 0,
                },
            ],
        });
    });
});
