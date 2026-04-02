import type { ManagerFieldChange } from '@/types/auth';
import type { RoadmapDocument } from '@/types/roadmap';

export interface RoadmapSaveRequest {
    document: RoadmapDocument;
    baseVersion: string | null;
}

export interface RoadmapManagerSaveRequest {
    changes: ManagerFieldChange[];
    baseVersion: string | null;
}
