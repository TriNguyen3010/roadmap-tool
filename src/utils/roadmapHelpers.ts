import { RoadmapItem } from '../types/roadmap';
import { differenceInDays, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

export interface FlattenedItem extends RoadmapItem {
    depth: number;
    parentIds: string[];
}

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

// Auto calculate % progress based on children average
export const calculateProgress = (items: RoadmapItem[]): RoadmapItem[] => {
    return items.map((item) => {
        if (!item.children || item.children.length === 0) {
            let progress = item.progress || 0;
            if (item.status === 'Done') progress = 100;
            if (item.status === 'Not Started') progress = 0;
            return { ...item, progress };
        }
        const updatedChildren = calculateProgress(item.children);
        const sumProgress = updatedChildren.reduce((sum, child) => sum + (child.progress || 0), 0);
        const avgProgress = Math.round(sumProgress / updatedChildren.length);
        return { ...item, children: updatedChildren, progress: avgProgress };
    });
};

// Update a specific node by id recursively
export const updateNodeById = (items: RoadmapItem[], id: string, updated: RoadmapItem): RoadmapItem[] => {
    return items.map((item) => {
        if (item.id === id) return { ...updated, children: updated.children !== undefined ? updated.children : item.children };
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
            return { ...item, children: [...(item.children || []), newChild] };
        }
        if (item.children) return { ...item, children: addChildToNode(item.children, parentId, newChild) };
        return item;
    });
};

// Generates an array of Date objects between start and end with a padding
export const generateTimelineDays = (startDateStr: string, endDateStr: string, paddingDays = 7): Date[] => {
    const start = addDays(new Date(startDateStr), -paddingDays);
    const end = addDays(new Date(endDateStr), paddingDays);
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
};

// Reorder items (top-level only)
export const reorderItems = (items: RoadmapItem[], fromId: string, toId: string): RoadmapItem[] => {
    if (fromId === toId) return items;

    const fromIndex = items.findIndex(i => i.id === fromId);
    const toIndex = items.findIndex(i => i.id === toId);

    if (fromIndex === -1 || toIndex === -1) return items;

    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);

    // Recalculate toIndex after removal
    const newToIndex = newItems.findIndex(i => i.id === toId);
    newItems.splice(newToIndex, 0, movedItem);

    return newItems;
};

export const filterRoadmapTree = (
    items: RoadmapItem[],
    filters: { status?: string[]; team?: string[]; priority?: string[] }
): RoadmapItem[] => {
    const hasStatusFilter = filters.status && filters.status.length > 0;
    const hasTeamFilter = filters.team && filters.team.length > 0;
    const hasPriorityFilter = filters.priority && filters.priority.length > 0;

    if (!hasStatusFilter && !hasTeamFilter && !hasPriorityFilter) return items;

    return items
        .map(item => {
            const filteredChildren = item.children ? filterRoadmapTree(item.children, filters) : [];

            let matchesStatus = true;
            let matchesTeam = true;
            let matchesPriority = true;

            if (hasStatusFilter) {
                matchesStatus = filters.status!.includes(item.status);
            }

            if (hasTeamFilter) {
                if (item.type === 'team' && item.teamRole) {
                    matchesTeam = filters.team!.includes(item.teamRole);
                } else {
                    matchesTeam = false;
                }
            }

            if (hasPriorityFilter) {
                if ((item.type === 'group' || item.type === 'feature') && item.priority) {
                    matchesPriority = filters.priority!.includes(item.priority);
                } else {
                    matchesPriority = false;
                }
            }

            const isMatch = matchesStatus && matchesTeam && matchesPriority;

            if (isMatch || filteredChildren.length > 0) {
                return { ...item, children: filteredChildren };
            }

            return null;
        })
        .filter(Boolean) as RoadmapItem[];
};
