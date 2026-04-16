import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest, type AuthenticatedTeamRequest } from '@/lib/serverTeamAuth';
import type { RoadmapDocument } from '@/types/roadmap';
import { buildVersionConflictPayload, normalizeVersion } from '@/utils/roadmapConcurrency';
import {
    normalizeSharedRoadmapDocument,
    resolveDocumentSaveRequest,
    validateBaseVersion,
} from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import { getStorageMode, fullDocumentSync, insertItemChanges, loadRoadmapVersion, bumpRoadmapTimestamp, type InsertItemChangeInput } from '@/server/roadmapRowsRepo';
import type { RoadmapItem } from '@/types/roadmap';

export const runtime = 'nodejs';

/**
 * POST /api/roadmap/[id]/save — Admin full-document save.
 * Routes to legacy JSON flow or table-based flow based on storage_mode.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const requestBody = await request.json();
        const mode = await getStorageMode(id);

        if (mode === 'json') {
            return saveLegacyJson(id, requestBody, auth);
        }

        return saveTableBased(id, requestBody, auth);
    } catch (err: unknown) {
        const { id } = await params;
        logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'error', status: 500, reason: 'unexpected-exception' });
        console.error('Failed to save roadmap:', err);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(err) }, { status: 500 });
    }
}

// ── Legacy JSON save (optimistic locking) ────────────────────────────────────

async function saveLegacyJson(id: string, requestBody: unknown, auth: AuthenticatedTeamRequest) {
    const { document: incoming, baseVersion } = resolveDocumentSaveRequest(requestBody);

    const { data: currentRow, error: readError } = await supabase
        .from('roadmap_data').select('content, updated_at').eq('id', id).maybeSingle();
    if (readError) return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
    if (!currentRow) return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });

    const versionCheck = validateBaseVersion(baseVersion, typeof currentRow.updated_at === 'string' ? currentRow.updated_at : null);
    if (!versionCheck.ok) return NextResponse.json(versionCheck.payload, { status: versionCheck.status });

    const currentVersion = versionCheck.currentVersion;
    const normalizedDoc = normalizeSharedRoadmapDocument(incoming);
    const updatedAt = new Date().toISOString();

    let updateQuery = supabase.from('roadmap_data').update({ content: normalizedDoc, updated_at: updatedAt }).eq('id', id);
    updateQuery = currentVersion ? updateQuery.eq('updated_at', currentVersion) : updateQuery.is('updated_at', null);
    const { data: savedRow, error } = await updateQuery.select('updated_at').maybeSingle();

    if (error) return NextResponse.json({ error: 'Supabase error', message: error.message }, { status: 500 });
    if (!savedRow) {
        const { data: latestRow } = await supabase.from('roadmap_data').select('updated_at').eq('id', id).maybeSingle();
        const serverVersion = normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null);
        return NextResponse.json(buildVersionConflictPayload(serverVersion), { status: 409 });
    }

    // Write changelog: diff old document vs new document
    const oldDoc = currentRow.content as RoadmapDocument | null;
    if (oldDoc) {
        const changeRecords = diffDocumentTreeForChangelog(
            oldDoc.items ?? [],
            normalizedDoc.items ?? [],
            auth.sessionUser.email,
            auth.sessionUser.label
        );
        if (changeRecords.length > 0) {
            await insertItemChanges(id, changeRecords);
        }
    }

    const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;
    logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'success', status: 200, baseVersion, serverVersion: persistedVersion, actor: auth.sessionUser });
    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}

// ── Changelog diff for JSON document trees ──────────────────────────────────

const TRACKED_ITEM_FIELDS = ['status', 'startDate', 'endDate', 'quickNote', 'version', 'extra'] as const;

function diffDocumentTreeForChangelog(
    oldItems: RoadmapItem[],
    newItems: RoadmapItem[],
    changedBy: string,
    changedByLabel?: string
): InsertItemChangeInput[] {
    const oldMap = new Map<string, RoadmapItem>();
    flattenTree(oldItems, oldMap);
    const newMap = new Map<string, RoadmapItem>();
    flattenTree(newItems, newMap);

    const records: InsertItemChangeInput[] = [];

    for (const [itemId, newItem] of newMap) {
        const oldItem = oldMap.get(itemId);
        if (!oldItem) continue; // new item, no "old" to compare

        const team = resolveTeamFromItem(newItem) ?? resolveTeamFromItem(oldItem) ?? null;

        for (const field of TRACKED_ITEM_FIELDS) {
            const oldVal = (oldItem as unknown as Record<string, unknown>)[field];
            const newVal = (newItem as unknown as Record<string, unknown>)[field];
            const oldStr = oldVal != null ? String(oldVal) : null;
            const newStr = newVal != null ? String(newVal) : null;
            if (oldStr !== newStr) {
                records.push({ itemId, team, field, oldValue: oldStr, newValue: newStr, changedBy, changedByLabel: changedByLabel ?? null });
            }
        }
    }

    return records;
}

function flattenTree(items: RoadmapItem[], map: Map<string, RoadmapItem>): void {
    for (const item of items) {
        map.set(item.id, item);
        if (item.children) flattenTree(item.children, map);
    }
}

function resolveTeamFromItem(item: RoadmapItem): string | null {
    return (item as unknown as Record<string, unknown>).teamRole as string | null ?? null;
}

// ── Table-based save (optimistic locking via roadmaps.updated_at) ────────────
//
// Concurrency model:
//   - CAS source: roadmaps.updated_at — matches /api/roadmap/[id]/version and
//     admin-patch. Using roadmap_data.updated_at would cause spurious 409s
//     because regenerateJsonBlob bumps it via SQL now() (Postgres clock) while
//     admin-patch/version use roadmaps.updated_at (JS clock). The two columns
//     drift apart after every row-level patch.
//   - Note: this is "check then write" (not atomic CAS like JSON mode), so a
//     ~10ms TOCTOU window remains. Acceptable trade-off for Approach A —
//     dramatically reduces the bug from "always" to "rare race condition".
async function saveTableBased(id: string, requestBody: unknown, auth: AuthenticatedTeamRequest) {
    const { document: incoming, baseVersion } = resolveDocumentSaveRequest(requestBody);
    if (!incoming || typeof incoming !== 'object') {
        return NextResponse.json({ error: 'Missing document in request body' }, { status: 400 });
    }

    // Optimistic locking: use roadmaps.updated_at (same source as /version
    // and admin-patch — NOT roadmap_data.updated_at which drifts).
    const currentVersion = await loadRoadmapVersion(id);
    const versionCheck = validateBaseVersion(baseVersion, currentVersion);
    if (!versionCheck.ok) {
        logRoadmapSaveTelemetry({
            route: 'admin-save',
            roadmapId: id,
            outcome: 'rejected',
            status: versionCheck.status,
            reason: 'version-mismatch',
            baseVersion,
            serverVersion: currentVersion,
            actor: auth.sessionUser,
        });
        return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
    }

    const normalizedDoc = normalizeSharedRoadmapDocument(incoming as RoadmapDocument);
    const result = await fullDocumentSync(id, normalizedDoc, auth.sessionUser.email, auth.sessionUser.label);

    if (!result.success) {
        logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'error', status: 500, reason: result.error ?? 'sync-failed', actor: auth.sessionUser });
        return NextResponse.json({ error: 'Failed to save roadmap', message: result.error }, { status: 500 });
    }

    // Bump roadmaps.updated_at AFTER fullDocumentSync (which calls
    // regenerateJsonBlob internally). This ensures the returned version
    // matches what /version and admin-patch will see next.
    const persistedVersion = normalizeVersion(await bumpRoadmapTimestamp(id)) ?? result.updatedAt;

    logRoadmapSaveTelemetry({
        route: 'admin-save',
        roadmapId: id,
        outcome: 'success',
        status: 200,
        baseVersion,
        serverVersion: persistedVersion,
        actor: auth.sessionUser,
    });
    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}
