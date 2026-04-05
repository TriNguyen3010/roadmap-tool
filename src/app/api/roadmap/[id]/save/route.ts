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
import { getStorageMode, fullDocumentSync } from '@/server/roadmapRowsRepo';

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
        .from('roadmap_data').select('updated_at').eq('id', id).maybeSingle();
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

    const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;
    logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'success', status: 200, baseVersion, serverVersion: persistedVersion, actor: auth.sessionUser });
    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}

// ── Table-based save (last-write-wins) ───────────────────────────────────────

async function saveTableBased(id: string, requestBody: unknown, auth: AuthenticatedTeamRequest) {
    const incoming = (requestBody as Record<string, unknown>)?.document;
    if (!incoming || typeof incoming !== 'object') {
        return NextResponse.json({ error: 'Missing document in request body' }, { status: 400 });
    }

    const normalizedDoc = normalizeSharedRoadmapDocument(incoming as RoadmapDocument);
    const result = await fullDocumentSync(id, normalizedDoc, auth.sessionUser.email);

    if (!result.success) {
        logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'error', status: 500, reason: result.error ?? 'sync-failed', actor: auth.sessionUser });
        return NextResponse.json({ error: 'Failed to save roadmap', message: result.error }, { status: 500 });
    }

    logRoadmapSaveTelemetry({ route: 'admin-save', roadmapId: id, outcome: 'success', status: 200, serverVersion: result.updatedAt, actor: auth.sessionUser });
    return NextResponse.json({ success: true, updatedAt: result.updatedAt });
}
