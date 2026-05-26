export interface RoadmapVisibilityItem {
    id: string;
    name: string;
}

const HIDDEN_ROADMAP_IDS = new Set([
    'main',
    'e101b240-887a-4b6f-a497-220e0ba25409',
]);

const HIDDEN_ROADMAP_NAMES = new Set([
    'roadmap demo',
    'roadmap super wallet',
]);

function normalizeRoadmapName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isHiddenRoadmap(roadmap: RoadmapVisibilityItem): boolean {
    return HIDDEN_ROADMAP_IDS.has(roadmap.id) || HIDDEN_ROADMAP_NAMES.has(normalizeRoadmapName(roadmap.name));
}

export function filterVisibleRoadmaps<T extends RoadmapVisibilityItem>(roadmaps: T[]): T[] {
    return roadmaps.filter((roadmap) => !isHiddenRoadmap(roadmap));
}
