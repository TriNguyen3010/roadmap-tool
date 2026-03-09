import {
    ItemPriority,
    ItemStatus,
    PHASE_FILTER_NONE,
    PRIORITY_FILTER_NONE,
    RoadmapItem,
    StatusMode,
    normalizeGroupItemType,
    normalizeGroupItemTypeFilter,
    normalizeItemPriority,
    normalizeItemStatus,
    normalizePhaseFilterValues,
    normalizePhaseIds,
    normalizePriorityFilterValues,
    normalizeStatusFilter
} from '../types/roadmap';
import { addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

export interface FlattenedItem extends RoadmapItem {
    depth: number;
    parentIds: string[];
}

type RoadmapItemWithTransientFields = RoadmapItem & {
    depth?: number;
    parentIds?: string[];
};

export const flattenRoadmap = (items: RoadmapItem[], parentIds: string[] = [], depth = 0): FlattenedItem[] => {
    let result: FlattenedItem[] = [];
    for (const item of items) {
        const flatItem: FlattenedItem = { ...item, depth, parentIds };
        result.push(flatItem);
        if (item.children && item.children.length > 0) {
            result = result.concat(flattenRoadmap(item.children, [...parentIds, item.id], depth + 1));
        }
    }
    return result;
};

const stripTransientFields = (item: RoadmapItem): RoadmapItem => {
    const { depth, parentIds, ...rest } = item as RoadmapItemWithTransientFields;
    void depth;
    void parentIds;
    const cleanedChildren = rest.children?.map(stripTransientFields);
    return {
        ...rest,
        ...(rest.children !== undefined ? { children: cleanedChildren } : {}),
    };
};

const deriveStatusFromChildren = (children: RoadmapItem[]): ItemStatus => {
    const normalizedStatuses = children.map(c => normalizeItemStatus(c.status));
    const allNotStarted = normalizedStatuses.every(status => status === 'Not Started');
    const allDone = normalizedStatuses.every(status => status === 'Done');
    const hasDevInProgress = normalizedStatuses.some(status => status === 'Dev In Progress');
    const hasPdInProgress = normalizedStatuses.some(status => status === 'PD In Progress');

    if (allDone) return 'Done';
    if (allNotStarted) return 'Not Started';
    if (hasDevInProgress) return 'Dev In Progress';
    if (hasPdInProgress) return 'PD In Progress';
    return 'Dev In Progress';
};

const recalculateItem = (rawItem: RoadmapItem): RoadmapItem => {
    const item = stripTransientFields(rawItem);
    const hasChildren = !!(item.children && item.children.length > 0);
    const updatedChildren = item.children?.map(recalculateItem);

    const fallbackMode: StatusMode = hasChildren ? 'auto' : 'manual';
    const statusMode: StatusMode = hasChildren ? (item.statusMode ?? fallbackMode) : 'manual';

    const normalizedItemStatus = normalizeItemStatus(item.status);
    const derivedStatus: ItemStatus = hasChildren
        ? deriveStatusFromChildren(updatedChildren || [])
        : normalizedItemStatus;

    const manualStatus: ItemStatus | undefined = statusMode === 'manual'
        ? normalizeItemStatus(item.manualStatus ?? item.status)
        : undefined;

    const effectiveStatus: ItemStatus = statusMode === 'manual'
        ? (manualStatus || 'Not Started')
        : derivedStatus;

    let progress = item.progress || 0;
    if (hasChildren && updatedChildren && updatedChildren.length > 0) {
        const sumProgress = updatedChildren.reduce((sum, child) => sum + (child.progress || 0), 0);
        progress = Math.round(sumProgress / updatedChildren.length);
    } else if (effectiveStatus === 'Done') {
        progress = 100;
    } else if (effectiveStatus === 'Not Started') {
        progress = 0;
    }

    return {
        ...item,
        ...(item.children !== undefined ? { children: updatedChildren } : {}),
        priority: normalizeItemPriority(item.priority),
        statusMode,
        manualStatus,
        status: effectiveStatus,
        progress,
    };
};

export const recalculateRoadmap = (items: RoadmapItem[]): RoadmapItem[] => {
    return items.map(recalculateItem);
};

// Auto calculate % progress based on children average
export const calculateProgress = (items: RoadmapItem[]): RoadmapItem[] => {
    return recalculateRoadmap(items);
};

// Auto derive status from children:
// - All Not Started → Not Started
// - All Done → Done
// - Any Dev In Progress → Dev In Progress
// - Else any PD In Progress → PD In Progress
export const calculateStatus = (items: RoadmapItem[]): RoadmapItem[] => {
    return recalculateRoadmap(items);
};

// Update a specific node by id recursively
export const updateNodeById = (items: RoadmapItem[], id: string, updated: RoadmapItem): RoadmapItem[] => {
    return items.map((item) => {
        if (item.id === id) {
            const cleaned = stripTransientFields(updated);
            return { ...cleaned, children: cleaned.children !== undefined ? cleaned.children : item.children };
        }
        if (item.children) return { ...item, children: updateNodeById(item.children, id, updated) };
        return item;
    });
};

// Delete a specific node by id recursively
export const deleteNodeById = (items: RoadmapItem[], id: string): RoadmapItem[] => {
    return items
        .filter((item) => item.id !== id)
        .map((item) => {
            if (item.children) return { ...item, children: deleteNodeById(item.children, id) };
            return item;
        });
};

// Add a new child to specific parent by id recursively
export const addChildToNode = (items: RoadmapItem[], parentId: string, newChild: RoadmapItem): RoadmapItem[] => {
    return items.map((item) => {
        if (item.id === parentId) {
            return { ...item, children: [...(item.children || []), stripTransientFields(newChild)] };
        }
        if (item.children) return { ...item, children: addChildToNode(item.children, parentId, newChild) };
        return item;
    });
};

export const findNodeById = (items: RoadmapItem[], id: string): RoadmapItem | null => {
    for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
            const found = findNodeById(item.children, id);
            if (found) return found;
        }
    }
    return null;
};

// Generates an array of Date objects between start and end with a padding
export const generateTimelineDays = (startDateStr: string, endDateStr: string, paddingDays = 7): Date[] => {
    const start = addDays(new Date(startDateStr), -paddingDays);
    const end = addDays(new Date(endDateStr), paddingDays);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
};

// Reorder items within the same sibling layer (same direct parent)
export const reorderItems = (items: RoadmapItem[], fromId: string, toId: string): RoadmapItem[] => {
    if (fromId === toId) return items;

    const reorderInLayer = (layer: RoadmapItem[]): { next: RoadmapItem[]; changed: boolean } => {
        const fromIndex = layer.findIndex(i => i.id === fromId);
        const toIndex = layer.findIndex(i => i.id === toId);

        // Both nodes are in this exact sibling array -> reorder here
        if (fromIndex !== -1 && toIndex !== -1) {
            const next = [...layer];
            const [movedItem] = next.splice(fromIndex, 1);
            const newToIndex = next.findIndex(i => i.id === toId);
            next.splice(newToIndex, 0, movedItem);
            return { next, changed: true };
        }

        // Exactly one node found in this layer means different parents -> invalid move
        if (fromIndex !== -1 || toIndex !== -1) {
            return { next: layer, changed: false };
        }

        let changed = false;
        const next = layer.map(item => {
            if (!item.children || item.children.length === 0) return item;
            const childResult = reorderInLayer(item.children);
            if (!childResult.changed) return item;
            changed = true;
            return { ...item, children: childResult.next };
        });

        return changed ? { next, changed: true } : { next: layer, changed: false };
    };

    const result = reorderInLayer(items);
    return result.changed ? result.next : items;
};

export const filterRoadmapTree = (
    items: RoadmapItem[],
    filters: {
        category?: string[];
        status?: string[];
        team?: string[];
        priority?: string[];
        phase?: string[];
        subcategory?: string[];
        groupItemType?: string[];
    }
): RoadmapItem[] => {
    const hasCategoryFilter = filters.category && filters.category.length > 0;
    const hasStatusFilter = filters.status && filters.status.length > 0;
    const hasTeamFilter = filters.team && filters.team.length > 0;
    const hasPriorityFilter = filters.priority && filters.priority.length > 0;
    const hasPhaseFilter = filters.phase && filters.phase.length > 0;
    const hasSubcategoryFilter = filters.subcategory && filters.subcategory.length > 0;
    const hasGroupItemTypeFilter = filters.groupItemType && filters.groupItemType.length > 0;

    if (!hasCategoryFilter && !hasStatusFilter && !hasTeamFilter && !hasPriorityFilter && !hasPhaseFilter && !hasSubcategoryFilter && !hasGroupItemTypeFilter) {
        return items;
    }

    const selectedCategories = new Set(filters.category || []);
    const selectedStatuses = new Set(normalizeStatusFilter(filters.status));
    const selectedTeams = new Set(filters.team || []);
    const selectedPriorityFilters = new Set(normalizePriorityFilterValues(filters.priority));
    const wantsNonePriority = selectedPriorityFilters.has(PRIORITY_FILTER_NONE);
    const selectedPriorities = new Set<ItemPriority>(
        Array.from(selectedPriorityFilters).filter((value): value is ItemPriority => value !== PRIORITY_FILTER_NONE)
    );
    const selectedPhaseFilters = new Set(normalizePhaseFilterValues(filters.phase));
    const wantsNonePhase = selectedPhaseFilters.has(PHASE_FILTER_NONE);
    const selectedPhaseIds = new Set<string>(
        Array.from(selectedPhaseFilters).filter((value): value is string => value !== PHASE_FILTER_NONE)
    );
    const selectedSubcategories = new Set(filters.subcategory || []);
    const selectedGroupItemTypes = new Set(normalizeGroupItemTypeFilter(filters.groupItemType));

    type Context = {
        insideSelectedCategory: boolean;
        insideSelectedSubcategory: boolean;
        insideSelectedPriority: boolean;
        insideSelectedGroupItemType: boolean;
    };

    type VisitResult = {
        node: RoadmapItem | null;
        hasSelectedTeamInSubtree: boolean;
    };

    const visitNode = (item: RoadmapItem, context: Context): VisitResult => {
        const isSelectedCategory = item.type === 'category' && selectedCategories.has(item.name);
        const isSelectedSubcategory = item.type === 'subcategory' && selectedSubcategories.has(item.name);
        const normalizedGroupItemType = normalizeGroupItemType(item.groupItemType);
        const isSelectedGroupItemType = item.type === 'group'
            && !!normalizedGroupItemType
            && selectedGroupItemTypes.has(normalizedGroupItemType);
        const normalizedPriority = normalizeItemPriority(item.priority);
        const isPriorityCarrier = item.type === 'group' || item.type === 'item';
        const isSelectedUnsetPriority = isPriorityCarrier && !normalizedPriority && wantsNonePriority;
        const hasPriorityValue = isPriorityCarrier && !!normalizedPriority;
        const isSelectedPriority =
            hasPriorityValue &&
            !!normalizedPriority &&
            selectedPriorities.has(normalizedPriority);

        const nextContext: Context = {
            insideSelectedCategory: context.insideSelectedCategory || isSelectedCategory,
            insideSelectedSubcategory: context.insideSelectedSubcategory || isSelectedSubcategory,
            insideSelectedGroupItemType: context.insideSelectedGroupItemType || isSelectedGroupItemType,
            // Priority context is inherited only through nodes that do not redefine priority.
            // If a group/item has its own priority and it does not match, priority context resets.
            insideSelectedPriority: isPriorityCarrier
                ? (isSelectedPriority || isSelectedUnsetPriority)
                : context.insideSelectedPriority,
        };

        const childResults = (item.children || []).map(child => visitNode(child, nextContext));
        const filteredChildren = childResults
            .map(result => result.node)
            .filter(Boolean) as RoadmapItem[];

        const localTeamMatch = item.type === 'team' && !!item.teamRole && selectedTeams.has(item.teamRole);
        const hasSelectedTeamInSubtree = localTeamMatch || childResults.some(result => result.hasSelectedTeamInSubtree);

        let matchesCategory = true;
        let matchesStatus = true;
        let matchesTeam = true;
        let matchesPriority = true;
        let matchesPhase = true;
        let matchesSubcategory = true;
        let matchesGroupItemType = true;

        if (hasCategoryFilter) {
            if (item.type === 'category') {
                matchesCategory = isSelectedCategory;
            } else {
                matchesCategory = nextContext.insideSelectedCategory;
            }
        }

        if (hasStatusFilter) {
            matchesStatus = selectedStatuses.has(normalizeItemStatus(item.status));
        }

        if (hasTeamFilter) {
            if (item.type === 'team' && item.teamRole) {
                matchesTeam = selectedTeams.has(item.teamRole);
            } else if (hasPriorityFilter) {
                // When combined with priority filter, allow non-team ancestors to satisfy team
                // via matching team descendants so item/group branches can survive intersection.
                matchesTeam = hasSelectedTeamInSubtree;
            } else {
                matchesTeam = false;
            }
        }

        if (hasPriorityFilter) {
            if (item.type === 'group' || item.type === 'item') {
                matchesPriority = isSelectedPriority || isSelectedUnsetPriority;
            } else if (hasTeamFilter) {
                // Allow team descendants under a selected-priority branch to satisfy priority
                // when team + priority filters are combined.
                matchesPriority = context.insideSelectedPriority || isSelectedPriority || isSelectedUnsetPriority;
            } else {
                matchesPriority = false;
            }
        }

        if (hasPhaseFilter) {
            const phaseIds = normalizePhaseIds(item.phaseIds);
            const hasPhaseMatch = phaseIds.some(phaseId => selectedPhaseIds.has(phaseId));
            const hasNonePhaseMatch = phaseIds.length === 0 && wantsNonePhase;
            matchesPhase = hasPhaseMatch || hasNonePhaseMatch;
        }

        if (hasSubcategoryFilter) {
            if (item.type === 'subcategory') {
                matchesSubcategory = isSelectedSubcategory;
            } else {
                matchesSubcategory = nextContext.insideSelectedSubcategory;
            }
        }

        if (hasGroupItemTypeFilter) {
            if (item.type === 'group') {
                matchesGroupItemType = isSelectedGroupItemType;
            } else {
                matchesGroupItemType = nextContext.insideSelectedGroupItemType;
            }
        }

        const isMatch = matchesCategory
            && matchesStatus
            && matchesTeam
            && matchesPriority
            && matchesPhase
            && matchesSubcategory
            && matchesGroupItemType;
        const node = (isMatch || filteredChildren.length > 0)
            ? { ...item, children: filteredChildren }
            : null;

        return {
            node,
            hasSelectedTeamInSubtree,
        };
    };

    return items
        .map(item => visitNode(item, {
            insideSelectedCategory: false,
            insideSelectedSubcategory: false,
            insideSelectedPriority: false,
            insideSelectedGroupItemType: false,
        }).node)
        .filter(Boolean) as RoadmapItem[];
};
