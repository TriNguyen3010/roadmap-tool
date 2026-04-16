import type { ManagerFieldChange } from '@/types/auth';
import type { Milestone, RoadmapDocument, RoadmapItem } from '@/types/roadmap';

export interface RoadmapSaveRequest {
    document: RoadmapDocument;
    baseVersion: string | null;
}

export interface RoadmapManagerSaveRequest {
    changes: ManagerFieldChange[];
    baseVersion: string | null;
}

export type RoadmapAdminPatchRequest =
    | {
        kind: 'milestones';
        milestones: Milestone[];
        baseVersion: string | null;
    }
    | {
        kind: 'release-meta';
        releaseName: string;
        baseVersion: string | null;
    };

// ─── Admin row-level item patch requests ─────────────────────────────────────
// Used by POST /api/roadmap/[id]/admin-patch to mutate a single item or
// perform a single structure operation, rather than saving the whole document.

export type AdminItemFieldName =
    | 'status'
    | 'startDate'
    | 'endDate'
    | 'quickNote'
    | 'name'
    | 'priority'
    | 'version'
    | 'groupItemType'
    | 'phaseIds'
    | 'extra';

export interface AdminItemFieldChange {
    itemId: string;
    field: AdminItemFieldName;
    // Plain JSON value — string | null for scalars, string[] for phaseIds,
    // Record<string,string> for extra. Validated on the server.
    value: unknown;
}

export type RoadmapAdminItemPatchRequest =
    | {
        kind: 'fields';
        changes: AdminItemFieldChange[];
        baseVersion: string | null;
    }
    | {
        kind: 'add-item';
        parentItemId: string | null;
        insertIndex: number;
        item: RoadmapItem;
        baseVersion: string | null;
    }
    | {
        kind: 'delete-item';
        itemId: string;
        baseVersion: string | null;
    }
    | {
        kind: 'move-item';
        itemId: string;
        newParentItemId: string | null;
        newIndex: number;
        baseVersion: string | null;
    }
    | {
        kind: 'convert-item-type';
        itemId: string;
        newType: 'subcategory' | 'group';
        newParentItemId: string | null;
        newIndex: number;
        baseVersion: string | null;
    };
