import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@/types/auth';
import type { RoadmapItem } from '@/types/roadmap';
import { getDocumentPermission, getEditPermission, getItemTeam, getItemTeams } from './permissions';

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
                            status: 'FE in progress',
                            statusMode: 'manual',
                            manualStatus: 'FE in progress',
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
                            status: 'BE in progress',
                            statusMode: 'manual',
                            manualStatus: 'BE in progress',
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

    it('grants FE manager edit access on the FE team row itself but not other team rows', () => {
        const items = makeTree();
        expect(getEditPermission(feManager, 'team-fe', items)).toEqual({
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: false,
            canEditMilestones: false,
            canManageRoadmap: false,
        });
        expect(getEditPermission(feManager, 'team-be', items)).toEqual({
            canEditStatus: false,
            canEditDates: false,
            canEditNotes: false,
            canEditStructure: false,
            canEditMilestones: false,
            canManageRoadmap: false,
        });
    });

    it('getItemTeams returns assignedTeams when present', () => {
        const items: RoadmapItem[] = [
            {
                id: 'multi-1',
                name: 'Multi-team Item',
                type: 'item',
                status: 'None',
                progress: 0,
                assignedTeams: ['FE', 'BE'],
                teamStatuses: {
                    FE: { status: 'FE in progress' },
                    BE: { status: 'BE in progress' },
                },
            },
        ];
        expect(getItemTeams('multi-1', items)).toEqual(['FE', 'BE']);
    });

    it('getItemTeams falls back to team-node ancestor', () => {
        const items = makeTree();
        expect(getItemTeams('item-fe-1', items)).toEqual(['FE']);
        expect(getItemTeams('item-be-1', items)).toEqual(['BE']);
    });

    it('getItemTeams returns empty array for item with no team', () => {
        const items = makeTree();
        expect(getItemTeams('cat-1', items)).toEqual([]);
    });

    it('FE manager can edit multi-team item that includes FE', () => {
        const items: RoadmapItem[] = [
            {
                id: 'multi-1',
                name: 'Multi-team Item',
                type: 'item',
                status: 'None',
                progress: 0,
                assignedTeams: ['FE', 'BE'],
                teamStatuses: {
                    FE: { status: 'FE in progress' },
                    BE: { status: 'BE in progress' },
                },
            },
        ];
        expect(getEditPermission(feManager, 'multi-1', items).canEditStatus).toBe(true);
    });

    it('FE manager cannot edit item assigned only to BE', () => {
        const items: RoadmapItem[] = [
            {
                id: 'be-only',
                name: 'BE Only Item',
                type: 'item',
                status: 'None',
                progress: 0,
                assignedTeams: ['BE'],
                teamStatuses: {
                    BE: { status: 'BE in progress' },
                },
            },
        ];
        expect(getEditPermission(feManager, 'be-only', items).canEditStatus).toBe(false);
    });
});
