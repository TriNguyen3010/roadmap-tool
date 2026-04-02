export const VERSION_CONFLICT_CODE = 'VERSION_MISMATCH';

export function normalizeVersion(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getVersionTimestamp(value: string | null | undefined): number | null {
    const normalized = normalizeVersion(value);
    if (!normalized) return null;

    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function isMatchingVersion(
    baseVersion: string | null | undefined,
    currentVersion: string | null | undefined
): boolean {
    const normalizedBase = normalizeVersion(baseVersion);
    const normalizedCurrent = normalizeVersion(currentVersion);

    if (normalizedBase === normalizedCurrent) return true;
    if (!normalizedBase || !normalizedCurrent) return false;

    const baseTimestamp = getVersionTimestamp(normalizedBase);
    const currentTimestamp = getVersionTimestamp(normalizedCurrent);

    if (baseTimestamp !== null && currentTimestamp !== null) {
        return baseTimestamp === currentTimestamp;
    }

    return false;
}

export function isVersionNewer(
    candidateVersion: string | null | undefined,
    currentVersion: string | null | undefined
): boolean {
    if (isMatchingVersion(candidateVersion, currentVersion)) return false;

    const candidateTimestamp = getVersionTimestamp(candidateVersion);
    const currentTimestamp = getVersionTimestamp(currentVersion);

    if (candidateTimestamp !== null && currentTimestamp !== null) {
        return candidateTimestamp > currentTimestamp;
    }

    const normalizedCandidate = normalizeVersion(candidateVersion);
    const normalizedCurrent = normalizeVersion(currentVersion);

    if (!normalizedCandidate) return false;
    if (!normalizedCurrent) return true;

    return normalizedCandidate !== normalizedCurrent;
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
