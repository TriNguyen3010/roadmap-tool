import type { EditPermission, ItemId, SessionUser } from '@/types/auth';
import { isAdminLevel } from '@/types/auth';
import type { ItemType, RoadmapItem, TeamRole as RoadmapTeamRole } from '@/types/roadmap';

const NONE_PERMISSION: EditPermission = {
    canEditStatus: false,
    canEditDates: false,
    canEditNotes: false,
    canEditStructure: false,
    canEditMilestones: false,
    canManageRoadmap: false,
};

/**
 * Returns ALL teams an item belongs to.
 * Priority:
 * 1. item.type === 'team' && item.teamRole → return [teamRole]
 * 2. Walk up parent → find nearest team-node ancestor
 */
export function getItemTeams(
    itemId: ItemId,
    items: RoadmapItem[],
    parentTeam?: RoadmapTeamRole
): RoadmapTeamRole[] {
    for (const item of items) {
        const currentTeam = item.type === 'team' && item.teamRole
            ? item.teamRole
            : parentTeam;

        if (item.id === itemId) {
            return currentTeam ? [currentTeam] : [];
        }

        if (item.children?.length) {
            const found = getItemTeams(itemId, item.children, currentTeam);
            if (found.length > 0) return found;
        }
    }

    return [];
}

/** Find the ItemType for a given itemId by walking the tree. */
export function getItemType(
    itemId: ItemId,
    items: RoadmapItem[]
): ItemType | null {
    for (const item of items) {
        if (item.id === itemId) return item.type;
        if (item.children?.length) {
            const found = getItemType(itemId, item.children);
            if (found) return found;
        }
    }
    return null;
}

// Backward-compatible wrapper: returns first team or null
export function getItemTeam(
    itemId: ItemId,
    items: RoadmapItem[],
    parentTeam?: RoadmapTeamRole
): RoadmapTeamRole | null {
    const teams = getItemTeams(itemId, items, parentTeam);
    return teams[0] || null;
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
        const itemType = getItemType(itemId, items);

        // Category items are never editable by managers
        if (itemType === 'category') return NONE_PERMISSION;

        // Manager can edit status/dates for all non-category items
        const itemTeams = getItemTeams(itemId, items);
        const isOwnTeam = itemTeams.includes(user.team as RoadmapTeamRole);

        return {
            canEditStatus: true,
            canEditDates: true,
            canEditNotes: isOwnTeam,
            canEditStructure: false,
            canEditMilestones: false,
            canManageRoadmap: false,
        };
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
