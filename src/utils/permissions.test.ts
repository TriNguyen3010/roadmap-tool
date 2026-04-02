import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@/types/auth';
import type { RoadmapItem } from '@/types/roadmap';
import { getDocumentPermission, getEditPermission, getItemTeam } from './permissions';

function makeTree(): RoadmapItem[] {
    return [
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
                    status: 'None',
                    progress: 0,
                    children: [
                        {
                            id: 'item-fe-1',
                            name: 'FE Task',
                            type: 'item',
                            status: 'FE Start',
                            statusMode: 'manual',
                            manualStatus: 'FE Start',
                            progress: 20,
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
                            status: 'BE Start',
                            statusMode: 'manual',
                            manualStatus: 'BE Start',
                            progress: 20,
                        },
                    ],
                },
            ],
        },
    ];
}

const adminUser: SessionUser = {
    email: 'tri@classicspins.com',
    role: 'admin',
    team: null,
    label: 'Tri Nguyen',
};

const feManager: SessionUser = {
    email: 'fe@classicspins.com',
    role: 'manager',
    team: 'FE',
    label: 'FE Manager',
};

describe('permissions', () => {
    it('resolves item team from nearest team ancestor', () => {
        const items = makeTree();
        expect(getItemTeam('item-fe-1', items)).toBe('FE');
        expect(getItemTeam('item-be-1', items)).toBe('BE');
        expect(getItemTeam('cat-1', items)).toBeNull();
    });

    it('grants admins full roadmap permissions', () => {
        expect(getDocumentPermission(adminUser)).toEqual({
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: true,
            canEditMilestones: true,
            canManageRoadmap: true,
        });
    });

    it('grants managers only item-level rights for their own team', () => {
        const items = makeTree();
        expect(getEditPermission(feManager, 'item-fe-1', items)).toEqual({
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: false,
            canEditMilestones: false,
            canManageRoadmap: false,
        });
        expect(getEditPermission(feManager, 'item-be-1', items).canEditStatus).toBe(false);
    });
});
