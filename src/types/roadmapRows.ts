import type {
    GroupItemType,
    ItemPriority,
    ItemStatus,
    ItemType,
    RoadmapDocument,
    RoadmapItem,
    RoadmapViewSettings,
    StatusMode,
    SubcategoryType,
    TeamRole,
} from '@/types/roadmap';

export interface RoadmapRowRecord {
    id: string;
    releaseName: string;
    startDate: string;
    endDate: string;
    sourceVersion?: string | null;
    config?: import('@/types/roadmap').RoadmapConfig;
}

export interface RoadmapItemRowRecord {
    roadmapId: string;
    itemId: string;
    parentItemId?: string | null;
    sortOrder: number;
    depth: number;
    itemType: ItemType;
    name: string;
    subcategoryType?: SubcategoryType;
    groupItemType?: GroupItemType;
    teamRole?: TeamRole;
    status: ItemStatus;
    statusMode?: StatusMode;
    manualStatus?: ItemStatus;
    progress: number;
    startDate?: string;
    endDate?: string;
    priority?: ItemPriority;
    version?: string;
    extra?: Record<string, string>;
    phaseIds: string[];
    quickNote?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface RoadmapMilestoneRowRecord {
    roadmapId: string;
    milestoneId: string;
    sortOrder: number;
    label: string;
    startDate: string;
    endDate: string;
    color: string;
}

export interface RoadmapItemImageRowRecord {
    roadmapId: string;
    itemId: string;
    imageId: string;
    sortOrder: number;
    url: string;
    name?: string;
    provider?: 'cloudinary';
    updatedAt?: string;
}

export interface RoadmapUserSettingsRowRecord {
    roadmapId: string;
    userScope: string;
    settings: RoadmapViewSettings;
    updatedAt?: string;
}

export interface NormalizedRoadmapRows {
    roadmap: RoadmapRowRecord;
    items: RoadmapItemRowRecord[];
    milestones: RoadmapMilestoneRowRecord[];
    itemImages: RoadmapItemImageRowRecord[];
}

export interface NormalizedRoadmapReadModel {
    roadmap: RoadmapRowRecord;
    items: RoadmapItemRowRecord[];
    milestones: RoadmapMilestoneRowRecord[];
    itemImages: RoadmapItemImageRowRecord[];
}

export type RoadmapRowSnapshot = NormalizedRoadmapRows;

export type RoadmapRowHydratedDocument = RoadmapDocument;

export interface RoadmapItemTreeNode extends RoadmapItem {
    children?: RoadmapItemTreeNode[];
}
