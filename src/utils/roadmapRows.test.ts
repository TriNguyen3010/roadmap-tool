import { describe, expect, it } from 'vitest';
import type { RoadmapDocument } from '@/types/roadmap';
import {
    buildRoadmapRowKey,
    flattenRoadmapDocumentToRows,
    inflateRoadmapDocumentFromRows,
    listRoadmapItemIds,
} from './roadmapRows';

function stripUndefined<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

describe('roadmapRows', () => {
    const document: RoadmapDocument = {
        releaseName: 'Release Alpha',
        startDate: '2026-04-01',
        endDate: '2026-05-30',
        milestones: [
            {
                id: 'phase-1',
                label: 'Week 1',
                startDate: '2026-04-01',
                endDate: '2026-04-05',
                color: '#ef4444',
            },
        ],
        items: [
            {
                id: 'cat-1',
                name: 'Category',
                type: 'category',
                status: 'None',
                progress: 0,
                children: [
                    {
                        id: 'team-fe',
                        name: 'FE',
                        type: 'team',
                        teamRole: 'FE',
                        status: 'FE Start',
                        statusMode: 'manual',
                        manualStatus: 'FE Start',
                        progress: 50,
                        phaseIds: ['phase-1'],
                        children: [
                            {
                                id: 'item-1',
                                name: 'Ship dashboard',
                                type: 'item',
                                status: 'FE Done',
                                statusMode: 'manual',
                                manualStatus: 'FE Done',
                                progress: 100,
                                startDate: '2026-04-01',
                                endDate: '2026-04-04',
                                priority: 'High',
                                quickNote: 'Ready for QC',
                                images: [
                                    {
                                        id: 'img-1',
                                        url: 'https://example.com/a.png',
                                        name: 'Design',
                                        provider: 'cloudinary',
                                        updatedAt: '2026-04-02T10:00:00.000Z',
                                    },
                                ],
                                created_at: '2026-04-01T09:00:00.000Z',
                                updated_at: '2026-04-02T10:00:00.000Z',
                            },
                        ],
                    },
                ],
            },
        ],
    };

    it('flattens a roadmap document into normalized row sets', () => {
        const rows = flattenRoadmapDocumentToRows('roadmap-1', document, '2026-04-02T11:00:00.000Z');

        expect(rows.roadmap).toEqual({
            id: 'roadmap-1',
            releaseName: 'Release Alpha',
            startDate: '2026-04-01',
            endDate: '2026-05-30',
            sourceVersion: '2026-04-02T11:00:00.000Z',
        });
        expect(rows.items).toHaveLength(3);
        expect(rows.itemImages).toHaveLength(1);
        expect(rows.milestones).toHaveLength(1);
        expect(rows.items[2]).toMatchObject({
            roadmapId: 'roadmap-1',
            itemId: 'item-1',
            parentItemId: 'team-fe',
            depth: 2,
            sortOrder: 0,
            phaseIds: [],
        });
    });

    it('rebuilds a roadmap document from normalized rows', () => {
        const rows = flattenRoadmapDocumentToRows('roadmap-1', document, '2026-04-02T11:00:00.000Z');
        const rebuilt = inflateRoadmapDocumentFromRows(rows);

        expect(stripUndefined(rebuilt)).toEqual({
            releaseName: 'Release Alpha',
            startDate: '2026-04-01',
            endDate: '2026-05-30',
            milestones: [
                {
                    id: 'phase-1',
                    label: 'Week 1',
                    startDate: '2026-04-01',
                    endDate: '2026-04-05',
                    color: '#ef4444',
                },
            ],
            items: [
                {
                    id: 'cat-1',
                    name: 'Category',
                    type: 'category',
                    status: 'None',
                    progress: 0,
                    children: [
                        {
                            id: 'team-fe',
                            name: 'FE',
                            type: 'team',
                            teamRole: 'FE',
                            status: 'FE Start',
                            statusMode: 'manual',
                            manualStatus: 'FE Start',
                            progress: 50,
                            phaseIds: ['phase-1'],
                            children: [
                                {
                                    id: 'item-1',
                                    name: 'Ship dashboard',
                                    type: 'item',
                                    status: 'FE Done',
                                    statusMode: 'manual',
                                    manualStatus: 'FE Done',
                                    progress: 100,
                                    startDate: '2026-04-01',
                                    endDate: '2026-04-04',
                                    priority: 'High',
                                    quickNote: 'Ready for QC',
                                    images: [
                                        {
                                            id: 'img-1',
                                            url: 'https://example.com/a.png',
                                            name: 'Design',
                                            provider: 'cloudinary',
                                            updatedAt: '2026-04-02T10:00:00.000Z',
                                        },
                                    ],
                                    imageUrl: 'https://example.com/a.png',
                                    imageId: 'img-1',
                                    imageName: 'Design',
                                    imageProvider: 'cloudinary',
                                    imageUpdatedAt: '2026-04-02T10:00:00.000Z',
                                    created_at: '2026-04-01T09:00:00.000Z',
                                    updated_at: '2026-04-02T10:00:00.000Z',
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });

    it('builds stable row keys and sorted item ids', () => {
        const rows = flattenRoadmapDocumentToRows('roadmap-1', document);
        expect(buildRoadmapRowKey('roadmap-1', 'item-1')).toBe('roadmap-1:item-1');
        expect(listRoadmapItemIds(rows.items)).toEqual(['cat-1', 'item-1', 'team-fe']);
    });
});
