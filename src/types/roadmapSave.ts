import type { ManagerFieldChange } from '@/types/auth';
import type { Milestone, RoadmapDocument } from '@/types/roadmap';

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
