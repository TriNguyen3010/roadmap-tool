import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagerFieldChange } from '@/types/auth';
import type { RoadmapItem } from '@/types/roadmap';
import { applyChangesToTree, validateManagerChanges } from './permissionCheck';

function makeItems(): RoadmapItem[] {
    return [
        {
            id: 'team-fe',
            name: 'FE',
            type: 'team',
            teamRole: 'FE',
            status: 'None',
            progress: 0,
            children: [
                {
                    id: 'item-fe-1',
                    name: 'FE Task',
                    type: 'item',
                    status: 'None',
                    statusMode: 'manual',
                    manualStatus: 'None',
                    progress: 0,
                    created_at: '2026-04-02T10:00:00.000Z',
                    updated_at: '2026-04-02T10:00:00.000Z',
                },
            ],
        },
        {
            id: 'team-be',
            name: 'BE',
            type: 'team',
            teamRole: 'BE',
            status: 'None',
            progress: 0,
            children: [
                {
                    id: 'item-be-1',
                    name: 'BE Task',
                    type: 'item',
                    status: 'None',
                    statusMode: 'manual',
                    manualStatus: 'None',
                    progress: 0,
                },
            ],
        },
    ];
}

describe('permissionCheck', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-03T08:30:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('rejects manager changes outside the manager team', () => {
        const changes: ManagerFieldChange[] = [
            { itemId: 'item-be-1', field: 'status', value: 'BE Start' },
        ];

        const result = validateManagerChanges('FE', changes, makeItems());
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('không phải FE');
    });

    it('rejects invalid status values', () => {
        const changes = [
            { itemId: 'item-fe-1', field: 'status', value: 'Invalid Status' },
        ] as ManagerFieldChange[];

        const result = validateManagerChanges('FE', changes, makeItems());
        expect(result.valid).toBe(false);
        expect(result.violations[0]).toContain('không hợp lệ');
    });

    it('applies manual status, notes, dates and touches timestamps', () => {
        const changes: ManagerFieldChange[] = [
            { itemId: 'item-fe-1', field: 'status', value: 'FE Done' },
            { itemId: 'item-fe-1', field: 'quickNote', value: 'Done by team' },
            { itemId: 'item-fe-1', field: 'startDate', value: '2026-04-01' },
            { itemId: 'item-fe-1', field: 'endDate', value: '2026-04-04' },
        ];

        const updated = applyChangesToTree(makeItems(), changes);
        const item = updated[0].children?.[0];

        expect(item?.statusMode).toBe('manual');
        expect(item?.manualStatus).toBe('FE Done');
        expect(item?.status).toBe('FE Done');
        expect(item?.quickNote).toBe('Done by team');
        expect(item?.startDate).toBe('2026-04-01');
        expect(item?.endDate).toBe('2026-04-04');
        expect(item?.created_at).toBe('2026-04-02T10:00:00.000Z');
        expect(item?.updated_at).toBe('2026-04-03T08:30:00.000Z');
    });
});
