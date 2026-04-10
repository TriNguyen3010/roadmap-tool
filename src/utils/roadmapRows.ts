import type { ItemImage, RoadmapDocument, RoadmapItem } from '@/types/roadmap';
import { normalizeItemImages, normalizePhaseIds, toLegacyImageFields } from '@/types/roadmap';
import type {
    NormalizedRoadmapReadModel,
    NormalizedRoadmapRows,
    RoadmapItemImageRowRecord,
    RoadmapItemRowRecord,
    RoadmapMilestoneRowRecord,
    RoadmapRowRecord,
} from '@/types/roadmapRows';

function sortLexicographically<T>(items: T[], getKey: (item: T) => string): T[] {
    return [...items].sort((a, b) => getKey(a).localeCompare(getKey(b)));
}

export function flattenRoadmapDocumentToRows(
    roadmapId: string,
    document: RoadmapDocument,
    sourceVersion?: string | null
): NormalizedRoadmapRows {
    const roadmap: RoadmapRowRecord = {
        id: roadmapId,
        releaseName: document.releaseName,
        startDate: document.startDate,
        endDate: document.endDate,
        sourceVersion: sourceVersion ?? null,
    };

    const items: RoadmapItemRowRecord[] = [];
    const itemImages: RoadmapItemImageRowRecord[] = [];

    const walkItems = (
        nodes: RoadmapItem[],
        parentItemId: string | null,
        depth: number
    ) => {
        nodes.forEach((item, sortOrder) => {
            items.push({
                roadmapId,
                itemId: item.id,
                parentItemId,
                sortOrder,
                depth,
                itemType: item.type,
                name: item.name,
                subcategoryType: item.subcategoryType,
                groupItemType: item.groupItemType,
                teamRole: item.teamRole,
                status: item.status,
                statusMode: item.statusMode,
                manualStatus: item.manualStatus,
                progress: item.progress,
                startDate: item.startDate,
                endDate: item.endDate,
                priority: item.priority,
                version: item.version,
                extra: item.extra,
                phaseIds: normalizePhaseIds(item.phaseIds),
                quickNote: item.quickNote,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
            });

            const images = normalizeItemImages(item);
            images.forEach((image, imageIndex) => {
                itemImages.push({
                    roadmapId,
                    itemId: item.id,
                    imageId: image.id,
                    sortOrder: imageIndex,
                    url: image.url,
                    name: image.name,
                    provider: image.provider,
                    updatedAt: image.updatedAt,
                });
            });

            if (item.children?.length) {
                walkItems(item.children, item.id, depth + 1);
            }
        });
    };

    walkItems(document.items || [], null, 0);

    const milestones: RoadmapMilestoneRowRecord[] = (document.milestones || []).map((milestone, sortOrder) => ({
        roadmapId,
        milestoneId: milestone.id,
        sortOrder,
        label: milestone.label,
        startDate: milestone.startDate,
        endDate: milestone.endDate,
        color: milestone.color,
    }));

    return {
        roadmap,
        items,
        milestones,
        itemImages,
    };
}

export function inflateRoadmapDocumentFromRows(
    rows: NormalizedRoadmapReadModel
): RoadmapDocument {
    const imageMap = new Map<string, ItemImage[]>();

    for (const image of sortRoadmapItemImages(rows.itemImages)) {
        const list = imageMap.get(image.itemId) || [];
        list.push({
            id: image.imageId,
            url: image.url,
            name: image.name,
            provider: image.provider,
            updatedAt: image.updatedAt,
        });
        imageMap.set(image.itemId, list);
    }

    const childrenMap = new Map<string | null, RoadmapItemRowRecord[]>();
    for (const row of sortRoadmapItems(rows.items)) {
        const parentKey = row.parentItemId ?? null;
        const list = childrenMap.get(parentKey) || [];
        list.push(row);
        childrenMap.set(parentKey, list);
    }

    const buildNodes = (parentItemId: string | null): RoadmapItem[] => {
        const children = childrenMap.get(parentItemId) || [];
        return children.map((row) => {
            const images = imageMap.get(row.itemId) || [];
            const childNodes = buildNodes(row.itemId);
            const phaseIds = normalizePhaseIds(row.phaseIds);
            const nextItem: RoadmapItem = {
                id: row.itemId,
                name: row.name,
                type: row.itemType,
                subcategoryType: row.subcategoryType,
                groupItemType: row.groupItemType,
                teamRole: row.teamRole,
                status: row.status,
                statusMode: row.statusMode,
                manualStatus: row.manualStatus,
                progress: row.progress,
                startDate: row.startDate,
                endDate: row.endDate,
                priority: row.priority,
                version: row.version,
                extra: row.extra && Object.keys(row.extra).length > 0 ? row.extra : undefined,
                phaseIds: phaseIds.length > 0 ? phaseIds : undefined,
                quickNote: row.quickNote,
                images: images.length > 0 ? images : undefined,
                ...toLegacyImageFields(images),
                created_at: row.createdAt,
                updated_at: row.updatedAt,
                children: childNodes.length > 0 ? childNodes : undefined,
            };
            return nextItem;
        });
    };

    const milestones = sortRoadmapMilestones(rows.milestones).map((milestone) => ({
        id: milestone.milestoneId,
        label: milestone.label,
        startDate: milestone.startDate,
        endDate: milestone.endDate,
        color: milestone.color,
    }));

    return {
        releaseName: rows.roadmap.releaseName,
        startDate: rows.roadmap.startDate,
        endDate: rows.roadmap.endDate,
        milestones,
        items: buildNodes(null),
        ...(rows.roadmap.config ? { config: rows.roadmap.config } : {}),
    };
}

export function sortRoadmapItems(rows: RoadmapItemRowRecord[]): RoadmapItemRowRecord[] {
    return [...rows].sort((a, b) => {
        if ((a.parentItemId ?? '') !== (b.parentItemId ?? '')) {
            return (a.parentItemId ?? '').localeCompare(b.parentItemId ?? '');
        }
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.itemId.localeCompare(b.itemId);
    });
}

export function sortRoadmapMilestones(rows: RoadmapMilestoneRowRecord[]): RoadmapMilestoneRowRecord[] {
    return [...rows].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.milestoneId.localeCompare(b.milestoneId);
    });
}

export function sortRoadmapItemImages(rows: RoadmapItemImageRowRecord[]): RoadmapItemImageRowRecord[] {
    return [...rows].sort((a, b) => {
        if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.imageId.localeCompare(b.imageId);
    });
}

export function buildRoadmapRowKey(roadmapId: string, itemId: string): string {
    return `${roadmapId}:${itemId}`;
}

export function listRoadmapItemIds(rows: RoadmapItemRowRecord[]): string[] {
    return sortLexicographically(rows, row => row.itemId).map(row => row.itemId);
}
