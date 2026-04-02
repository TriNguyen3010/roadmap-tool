import type { EditPermission, ItemId, SessionUser } from '@/types/auth';
import { isAdminLevel } from '@/types/auth';
import type { RoadmapItem, TeamRole as RoadmapTeamRole } from '@/types/roadmap';

const NONE_PERMISSION: EditPermission = {
    canEditStatus: false,
    canEditDates: false,
    canEditNotes: false,
    canEditStructure: false,
    canEditMilestones: false,
    canManageRoadmap: false,
};

export function getItemTeam(
    itemId: ItemId,
    items: RoadmapItem[],
    parentTeam?: RoadmapTeamRole
): RoadmapTeamRole | null {
    for (const item of items) {
        const currentTeam = item.type === 'team' && item.teamRole
            ? item.teamRole
            : parentTeam;

        if (item.id === itemId) return currentTeam || null;

        if (item.children?.length) {
            const found = getItemTeam(itemId, item.children, currentTeam);
            if (found !== null) return found;
        }
    }

    return null;
}

export function getEditPermission(
    user: SessionUser | null,
    itemId: ItemId,
    items: RoadmapItem[]
): EditPermission {
    if (!user) return NONE_PERMISSION;

    if (isAdminLevel(user)) {
        return {
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: true,
            canEditMilestones: true,
            canManageRoadmap: true,
        };
    }

    if (user.role === 'manager' && user.team) {
        const itemTeam = getItemTeam(itemId, items);
        if (itemTeam === user.team) {
            return {
                canEditStatus: true,
                canEditDates: true,
                canEditNotes: true,
                canEditStructure: false,
                canEditMilestones: false,
                canManageRoadmap: false,
            };
        }
    }

    return NONE_PERMISSION;
}

export function getDocumentPermission(user: SessionUser | null): EditPermission {
    if (!user) return NONE_PERMISSION;
    if (isAdminLevel(user)) {
        return {
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: true,
            canEditMilestones: true,
            canManageRoadmap: true,
        };
    }

    if (user.role === 'manager' && user.team) {
        return {
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: true,
            canEditStructure: false,
            canEditMilestones: false,
            canManageRoadmap: false,
        };
    }

    return NONE_PERMISSION;
}
