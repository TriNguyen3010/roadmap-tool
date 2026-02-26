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
        if (item.id === id) return { ...updated, children: item.children };
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
