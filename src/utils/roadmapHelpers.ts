import { ItemStatus, RoadmapItem, StatusMode } from '../types/roadmap';
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
    const allNotStarted = children.every(c => c.status === 'Not Started');
    const allDone = children.every(c => c.status === 'Done');
    return allDone ? 'Done' : allNotStarted ? 'Not Started' : 'In Progress';
};

const recalculateItem = (rawItem: RoadmapItem): RoadmapItem => {
    const item = stripTransientFields(rawItem);
    const hasChildren = !!(item.children && item.children.length > 0);
    const updatedChildren = item.children?.map(recalculateItem);

    const fallbackMode: StatusMode = hasChildren ? 'auto' : 'manual';
    const statusMode: StatusMode = hasChildren ? (item.statusMode ?? fallbackMode) : 'manual';

    const derivedStatus: ItemStatus = hasChildren
        ? deriveStatusFromChildren(updatedChildren || [])
        : item.status;

    const manualStatus: ItemStatus | undefined = statusMode === 'manual'
        ? (item.manualStatus ?? item.status)
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
// - Anything else (any mix, or any In Progress) → In Progress
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
    filters: { category?: string[]; status?: string[]; team?: string[]; priority?: string[]; subcategory?: string[] }
): RoadmapItem[] => {
    const hasCategoryFilter = filters.category && filters.category.length > 0;
    const hasStatusFilter = filters.status && filters.status.length > 0;
    const hasTeamFilter = filters.team && filters.team.length > 0;
    const hasPriorityFilter = filters.priority && filters.priority.length > 0;
    const hasSubcategoryFilter = filters.subcategory && filters.subcategory.length > 0;

    if (!hasCategoryFilter && !hasStatusFilter && !hasTeamFilter && !hasPriorityFilter && !hasSubcategoryFilter) return items;

    const selectedCategories = new Set(filters.category || []);
    const selectedStatuses = new Set(filters.status || []);
    const selectedTeams = new Set(filters.team || []);
    const selectedPriorities = new Set(filters.priority || []);
    const selectedSubcategories = new Set(filters.subcategory || []);

    const applyFilter = (
        nodes: RoadmapItem[],
        insideSelectedCategory: boolean,
        insideSelectedSubcategory: boolean
    ): RoadmapItem[] => {
        return nodes
            .map(item => {
                const isSelectedCategory = item.type === 'category' && selectedCategories.has(item.name);
                const isSelectedSubcategory = item.type === 'subcategory' && selectedSubcategories.has(item.name);
                const nextInsideSelectedCategory = insideSelectedCategory || isSelectedCategory;
                const nextInsideSelectedSubcategory = insideSelectedSubcategory || isSelectedSubcategory;
                const filteredChildren = item.children
                    ? applyFilter(item.children, nextInsideSelectedCategory, nextInsideSelectedSubcategory)
                    : [];

                let matchesCategory = true;
                let matchesStatus = true;
                let matchesTeam = true;
                let matchesPriority = true;
                let matchesSubcategory = true;

                if (hasCategoryFilter) {
                    if (item.type === 'category') {
                        matchesCategory = isSelectedCategory;
                    } else {
                        matchesCategory = nextInsideSelectedCategory;
                    }
                }

                if (hasStatusFilter) {
                    matchesStatus = selectedStatuses.has(item.status);
                }

                if (hasTeamFilter) {
                    if (item.type === 'team' && item.teamRole) {
                        matchesTeam = selectedTeams.has(item.teamRole);
                    } else {
                        matchesTeam = false;
                    }
                }

                if (hasPriorityFilter) {
                    if ((item.type === 'group' || item.type === 'feature') && item.priority) {
                        matchesPriority = selectedPriorities.has(item.priority);
                    } else {
                        matchesPriority = false;
                    }
                }

                if (hasSubcategoryFilter) {
                    if (item.type === 'subcategory') {
                        matchesSubcategory = isSelectedSubcategory;
                    } else {
                        matchesSubcategory = nextInsideSelectedSubcategory;
                    }
                }

                const isMatch = matchesCategory && matchesStatus && matchesTeam && matchesPriority && matchesSubcategory;

                if (isMatch || filteredChildren.length > 0) {
                    return { ...item, children: filteredChildren };
                }

                return null;
            })
            .filter(Boolean) as RoadmapItem[];
    };

    return applyFilter(items, false, false);
};
