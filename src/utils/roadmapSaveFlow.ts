import type { ManagerFieldChange } from '@/types/auth';
import type { RoadmapDocument } from '@/types/roadmap';
import type { RoadmapManagerSaveRequest, RoadmapSaveRequest } from '@/types/roadmapSave';
import { buildVersionConflictPayload, isMatchingVersion, normalizeVersion } from '@/utils/roadmapConcurrency';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';
import { stripViewSettingsFromDocument } from '@/utils/roadmapViewSettings';

type VersionValidationResult =
    | { ok: true; currentVersion: string | null }
    | { ok: false; status: 400 | 409; payload: { error: string; message?: string; code?: string; serverVersion?: string | null } };

export function resolveDocumentSaveRequest(body: unknown): RoadmapSaveRequest {
    if (body && typeof body === 'object' && 'document' in body) {
        const payload = body as Partial<RoadmapSaveRequest>;
        return {
            document: payload.document as RoadmapDocument,
            baseVersion: normalizeVersion(payload.baseVersion),
        };
    }

    return {
        document: body as RoadmapDocument,
        baseVersion: null,
    };
}

export function resolveManagerSaveRequest(body: unknown): RoadmapManagerSaveRequest {
    const payload = (body ?? {}) as Partial<RoadmapManagerSaveRequest>;

    return {
        changes: Array.isArray(payload.changes) ? payload.changes as ManagerFieldChange[] : [],
        baseVersion: normalizeVersion(payload.baseVersion),
    };
}

export function validateBaseVersion(
    baseVersion: string | null | undefined,
    currentVersion: string | null | undefined
): VersionValidationResult {
    const normalizedCurrentVersion = normalizeVersion(currentVersion);
    const normalizedBaseVersion = normalizeVersion(baseVersion);

    if (!normalizedBaseVersion) {
        return {
            ok: false,
            status: 400,
            payload: { error: 'Missing baseVersion' },
        };
    }

    if (!isMatchingVersion(normalizedBaseVersion, normalizedCurrentVersion)) {
        return {
            ok: false,
            status: 409,
            payload: buildVersionConflictPayload(normalizedCurrentVersion),
        };
    }

    return {
        ok: true,
        currentVersion: normalizedCurrentVersion,
    };
}

export function normalizeSharedRoadmapDocument(document: RoadmapDocument): RoadmapDocument {
    const stripped = stripViewSettingsFromDocument(document);
    return {
        ...stripped,
        items: recalculateRoadmap(normalizeRoadmapItemTimestamps(Array.isArray(stripped.items) ? stripped.items : [])),
    };
}

export function sanitizeSharedRoadmapDocument(document: RoadmapDocument): RoadmapDocument {
    return stripViewSettingsFromDocument(document);
}
