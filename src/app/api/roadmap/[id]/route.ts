import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import type { RoadmapDocument } from '@/types/roadmap';
import { buildVersionConflictPayload, normalizeVersion } from '@/utils/roadmapConcurrency';
import { validateNormalizedMilestones } from '@/utils/milestones';
import {
    resolveAdminPatchRequest,
    sanitizeSharedRoadmapDocument,
    validateBaseVersion,
} from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import { getStorageMode, loadRoadmapDocumentFromRows, regenerateJsonBlob } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

// GET /api/roadmap/[id] — load a specific roadmap's content
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const mode = await getStorageMode(id);

        if (mode === 'json') {
            // Legacy: read from JSON blob
            const { data, error } = await supabase
                .from('roadmap_data')
                .select('content')
                .eq('id', id)
                .single();
            if (error) throw error;
            return NextResponse.json(data.content);
        }

        // Table-based: read from normalized tables
        const document = await loadRoadmapDocumentFromRows(id);
        if (!document) {
            return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
        }

        return NextResponse.json(document);
    } catch (error) {
        console.error('Failed to read roadmap:', error);
        return NextResponse.json({ error: 'Failed to read roadmap data' }, { status: 500 });
    }
}

// DELETE /api/roadmap/[id] — delete a roadmap (requires editor auth)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const { error } = await supabase
            .from('roadmap_data')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Supabase delete error:', JSON.stringify(error));
            return NextResponse.json({ error: 'Supabase error', message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Failed to delete roadmap:', err);
        return NextResponse.json({ error: 'Failed to delete roadmap', message: String(err) }, { status: 500 });
    }
}

/**
 * PATCH /api/roadmap/[id] — Admin patch (milestones or release-meta).
 * Routes to legacy JSON flow or table-based flow based on storage_mode.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const requestBody = await request.json().catch(() => null);
        const patch = resolveAdminPatchRequest(requestBody);

        if (!patch) {
            return NextResponse.json({ error: 'Invalid admin patch payload' }, { status: 400 });
        }

        const mode = await getStorageMode(id);

        if (mode === 'json') {
            return patchLegacyJson(id, patch, auth);
        }

        return patchTableBased(id, patch, auth);
    } catch (err) {
        let roadmapId = 'unknown';
        try { roadmapId = (await params).id; } catch { /* */ }
        logRoadmapSaveTelemetry({ route: 'admin-patch', roadmapId, outcome: 'error', status: 500, reason: 'unexpected-exception' });
        console.error('Failed to patch roadmap:', err);
        return NextResponse.json({ error: 'Failed to patch roadmap', message: String(err) }, { status: 500 });
    }
}

// ── Legacy JSON PATCH ────────────────────────────────────────────────────────

async function patchLegacyJson(
    id: string,
    patch: NonNullable<ReturnType<typeof resolveAdminPatchRequest>>,
    auth: { sessionUser: unknown }
) {
    const { data: row, error: readError } = await supabase
        .from('roadmap_data')
        .select('content, updated_at')
        .eq('id', id)
        .maybeSingle();

    if (readError || !row?.content) {
        return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
    }

    const versionCheck = validateBaseVersion(
        patch.baseVersion,
        typeof row.updated_at === 'string' ? row.updated_at : null
    );
    if (!versionCheck.ok) {
        return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
    }

    const currentVersion = versionCheck.currentVersion;
    const currentDoc = sanitizeSharedRoadmapDocument(row.content as RoadmapDocument);
    let nextDoc: RoadmapDocument;

    if (patch.kind === 'milestones') {
        const validation = validateNormalizedMilestones(patch.milestones);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
        nextDoc = { ...currentDoc, milestones: validation.milestones };
    } else {
        const releaseName = patch.releaseName.trim();
        if (!releaseName) return NextResponse.json({ error: 'Release name is required' }, { status: 400 });
        nextDoc = { ...currentDoc, releaseName };
    }

    const updatedAt = new Date().toISOString();
    let saveQuery = supabase.from('roadmap_data').update({ content: nextDoc, updated_at: updatedAt }).eq('id', id);
    saveQuery = currentVersion ? saveQuery.eq('updated_at', currentVersion) : saveQuery.is('updated_at', null);
    const { data: savedRow, error: saveError } = await saveQuery.select('updated_at').maybeSingle();

    if (saveError) return NextResponse.json({ error: 'Failed to save', message: saveError.message }, { status: 500 });

    if (!savedRow) {
        const { data: latestRow } = await supabase.from('roadmap_data').select('updated_at').eq('id', id).maybeSingle();
        const serverVersion = normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null);
        return NextResponse.json(buildVersionConflictPayload(serverVersion), { status: 409 });
    }

    const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;
    logRoadmapSaveTelemetry({ route: 'admin-patch', roadmapId: id, outcome: 'success', status: 200, reason: patch.kind, serverVersion: persistedVersion, actor: auth.sessionUser });
    return NextResponse.json({ success: true, document: nextDoc, updatedAt: persistedVersion });
}

// ── Table-based PATCH ────────────────────────────────────────────────────────

async function patchTableBased(
    id: string,
    patch: NonNullable<ReturnType<typeof resolveAdminPatchRequest>>,
    auth: { sessionUser: unknown }
) {
    const updatedAt = new Date().toISOString();

    if (patch.kind === 'milestones') {
        const validation = validateNormalizedMilestones(patch.milestones);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

        await supabase.from('roadmap_milestones').delete().eq('roadmap_id', id);
        if (validation.milestones.length > 0) {
            const { error: msError } = await supabase
                .from('roadmap_milestones')
                .insert(validation.milestones.map((m, i) => ({
                    roadmap_id: id, milestone_id: m.id, sort_order: i,
                    label: m.label, start_date: m.startDate, end_date: m.endDate, color: m.color, updated_at: updatedAt,
                })));
            if (msError) return NextResponse.json({ error: 'Failed to save milestones', message: msError.message }, { status: 500 });
        }
        await supabase.from('roadmaps').update({ updated_at: updatedAt }).eq('id', id);
    } else {
        const releaseName = patch.releaseName.trim();
        if (!releaseName) return NextResponse.json({ error: 'Release name is required' }, { status: 400 });
        const { error: metaError } = await supabase.from('roadmaps').update({ release_name: releaseName, updated_at: updatedAt }).eq('id', id);
        if (metaError) return NextResponse.json({ error: 'Failed to update', message: metaError.message }, { status: 500 });
    }

    await regenerateJsonBlob(id);
    const document = await loadRoadmapDocumentFromRows(id);
    logRoadmapSaveTelemetry({ route: 'admin-patch', roadmapId: id, outcome: 'success', status: 200, reason: patch.kind, serverVersion: updatedAt, actor: auth.sessionUser });
    return NextResponse.json({ success: true, document, updatedAt });
}
