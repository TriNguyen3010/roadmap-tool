export const VERSION_CONFLICT_CODE = 'VERSION_MISMATCH';

export function normalizeVersion(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isMatchingVersion(
    baseVersion: string | null | undefined,
    currentVersion: string | null | undefined
): boolean {
    return normalizeVersion(baseVersion) === normalizeVersion(currentVersion);
}

export function buildVersionConflictPayload(currentVersion: string | null) {
    return {
        error: 'Conflict',
        code: VERSION_CONFLICT_CODE,
        serverVersion: normalizeVersion(currentVersion),
        message: 'Roadmap da duoc cap nhat boi nguoi khac. Vui long tai ban moi nhat truoc khi luu tiep.',
    };
}

export function buildConflictDraftStorageKey(roadmapId: string, scope: string): string {
    return `roadmap-conflict-draft:${roadmapId}:${scope}`;
}

export function buildRoadmapChannelName(roadmapId: string): string {
    return `roadmap-sync:${roadmapId}`;
}
