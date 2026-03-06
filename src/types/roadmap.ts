export type ItemType = 'category' | 'subcategory' | 'group' | 'team' | 'feature';
export type ItemStatus = 'Not Started' | 'PD In Progress' | 'Dev In Progress' | 'Done';
export type StatusMode = 'auto' | 'manual';
export type ColumnWidthMode = 'auto' | 'manual';
export type TimelineMode = 'day' | 'week' | 'month';
export type ItemPriority = 'High' | 'Medium' | 'Low' | 'Reported';
export const PRIORITY_FILTER_NONE = 'None' as const;
export type PriorityFilterValue = ItemPriority | typeof PRIORITY_FILTER_NONE;
export type SubcategoryType = 'Feature' | 'Bug' | 'Growth Camp';
export type TeamRole = 'BA' | 'Growth' | 'PD' | 'BE' | 'FE';
export const TEAM_ROLES: TeamRole[] = ['BA', 'Growth', 'PD', 'BE', 'FE'];
export const PRIORITY_LEVELS: ItemPriority[] = ['High', 'Medium', 'Low', 'Reported'];
export const STATUS_OPTIONS: ItemStatus[] = ['Not Started', 'PD In Progress', 'Dev In Progress', 'Done'];

export interface ItemImage {
  id: string;
  url: string;
  name?: string;
  provider?: 'cloudinary';
  updatedAt?: string;
}

export function normalizeItemStatus(status: string | undefined | null): ItemStatus {
  if (status === 'In Progress') return 'Dev In Progress';
  if (status === 'Not Started' || status === 'PD In Progress' || status === 'Dev In Progress' || status === 'Done') {
    return status;
  }
  return 'Not Started';
}

export function normalizeStatusFilter(statuses: string[] | undefined | null): ItemStatus[] {
  if (!statuses || statuses.length === 0) return [];
  return Array.from(new Set(statuses.map(normalizeItemStatus)));
}

export function normalizeItemPriority(priority: string | undefined | null): ItemPriority | undefined {
  if (!priority) return undefined;
  if (priority === 'Sếp Vinh') return 'Reported';
  if (priority === 'High' || priority === 'Medium' || priority === 'Low' || priority === 'Reported') {
    return priority;
  }
  return undefined;
}

export function normalizePriorityFilter(priorities: string[] | undefined | null): ItemPriority[] {
  if (!priorities || priorities.length === 0) return [];
  const normalized = priorities
    .map(normalizeItemPriority)
    .filter((p): p is ItemPriority => !!p);
  return Array.from(new Set(normalized));
}

export function normalizePriorityFilterValue(priority: string | undefined | null): PriorityFilterValue | undefined {
  if (!priority) return undefined;
  if (priority === PRIORITY_FILTER_NONE) return PRIORITY_FILTER_NONE;
  return normalizeItemPriority(priority);
}

export function normalizePriorityFilterValues(priorities: string[] | undefined | null): PriorityFilterValue[] {
  if (!priorities || priorities.length === 0) return [];
  const normalized = priorities
    .map(normalizePriorityFilterValue)
    .filter((p): p is PriorityFilterValue => !!p);
  return Array.from(new Set(normalized));
}

const normalizeImageProvider = (provider: string | undefined | null): 'cloudinary' | undefined => {
  if (provider === 'cloudinary') return provider;
  return undefined;
};

const normalizeImageCandidate = (raw: unknown): ItemImage | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as {
    id?: unknown;
    url?: unknown;
    name?: unknown;
    provider?: unknown;
    updatedAt?: unknown;
  };
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (!id || !url) return undefined;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined;
  const provider = typeof candidate.provider === 'string' ? normalizeImageProvider(candidate.provider) : undefined;
  return {
    id,
    url,
    name: name || undefined,
    provider,
    updatedAt,
  };
};

export function normalizeItemImages(item: {
  images?: ItemImage[] | unknown[];
  imageUrl?: string;
  imageId?: string;
  imageName?: string;
  imageProvider?: 'cloudinary' | string;
  imageUpdatedAt?: string;
}): ItemImage[] {
  const normalized: ItemImage[] = [];
  const seen = new Set<string>();

  const pushUnique = (image: ItemImage | undefined) => {
    if (!image) return;
    const key = `${image.id}::${image.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(image);
  };

  if (Array.isArray(item.images)) {
    for (const image of item.images) {
      pushUnique(normalizeImageCandidate(image));
    }
  }

  const legacyId = typeof item.imageId === 'string' ? item.imageId.trim() : '';
  const legacyUrl = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '';
  if (legacyId && legacyUrl) {
    const legacyName = typeof item.imageName === 'string' ? item.imageName.trim() : '';
    const legacyProvider = typeof item.imageProvider === 'string' ? normalizeImageProvider(item.imageProvider) : undefined;
    pushUnique({
      id: legacyId,
      url: legacyUrl,
      name: legacyName || undefined,
      provider: legacyProvider,
      updatedAt: typeof item.imageUpdatedAt === 'string' ? item.imageUpdatedAt : undefined,
    });
  }

  return normalized;
}

export function toLegacyImageFields(images: ItemImage[]): {
  imageUrl?: string;
  imageId?: string;
  imageName?: string;
  imageProvider?: 'cloudinary';
  imageUpdatedAt?: string;
} {
  const first = images[0];
  if (!first) {
    return {
      imageUrl: undefined,
      imageId: undefined,
      imageName: undefined,
      imageProvider: undefined,
      imageUpdatedAt: undefined,
    };
  }
  return {
    imageUrl: first.url,
    imageId: first.id,
    imageName: first.name,
    imageProvider: first.provider,
    imageUpdatedAt: first.updatedAt,
  };
}


export interface RoadmapItem {
  id: string;
  name: string;
  type: ItemType;
  subcategoryType?: SubcategoryType; // only meaningful when type === 'subcategory'
  teamRole?: TeamRole; // only meaningful when type === 'team'
  // status shown in UI (effective value after auto/manual resolution)
  status: ItemStatus;
  // when mode is manual, manualStatus is the source value user sets
  statusMode?: StatusMode;
  manualStatus?: ItemStatus;
  progress: number;
  startDate?: string;
  endDate?: string;
  priority?: ItemPriority;
  quickNote?: string;
  images?: ItemImage[];
  // Legacy single-image fields kept for backward compatibility.
  imageUrl?: string;
  imageId?: string;
  imageName?: string;
  imageProvider?: 'cloudinary';
  imageUpdatedAt?: string;
  children?: RoadmapItem[];
}

export interface Milestone {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  color: string; // hex color, e.g. '#ef4444'
}

export interface RoadmapDocument {
  releaseName: string;
  startDate: string;
  endDate: string;
  milestones?: Milestone[];
  settings?: {
    beforeWeeks: number;
    afterMonths: number;
    filterCategory?: string[];
    filterStatus?: string[];
    filterTeam?: string[];
    filterPriority?: string[];
    filterSubcategory?: string[];
    colPriority?: boolean;
    colPct?: boolean;
    colStartDate?: boolean;
    colEndDate?: boolean;
    colFeaturesWidth?: number;
    colFeaturesWidthMode?: ColumnWidthMode;
    timelineMode?: TimelineMode;
    expandedIds?: string[];
    hiddenRowIds?: string[];
  };
  items: RoadmapItem[];
}
