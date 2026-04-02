import type { RoadmapDocument, RoadmapViewSettings } from '@/types/roadmap';

export function stripViewSettingsFromDocument(document: RoadmapDocument): RoadmapDocument {
    const rest = { ...document };
    delete rest.settings;
    return rest;
}

export function buildViewSettingsStorageKey(roadmapId: string, scope: string): string {
    return `roadmap-view-settings:${roadmapId}:${scope}`;
}

export function parseStoredViewSettings(raw: string | null): Partial<RoadmapViewSettings> | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Partial<RoadmapViewSettings>;
    } catch {
        return null;
    }
}
