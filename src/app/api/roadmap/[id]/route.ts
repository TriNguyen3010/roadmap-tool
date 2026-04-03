import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { validateNormalizedMilestones } from '@/utils/milestones';
import { resolveAdminPatchRequest } from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import { loadRoadmapDocumentFromRows, regenerateJsonBlob } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

// GET /api/roadmap/[id] — load a specific roadmap's content (reads from normalized tables)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

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
 * Writes directly to normalized tables, then regenerates JSON blob backup.
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

        const updatedAt = new Date().toISOString();

        if (patch.kind === 'milestones') {
            const validation = validateNormalizedMilestones(patch.milestones);
            if (!validation.ok) {
                logRoadmapSaveTelemetry({
                    route: 'admin-patch',
                    roadmapId: id,
                    outcome: 'rejected',
                    status: 400,
                    reason: 'invalid-milestones',
                    actor: auth.sessionUser,
                });
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }

            // Delete old milestones and insert new ones
            await supabase.from('roadmap_milestones').delete().eq('roadmap_id', id);
            if (validation.milestones.length > 0) {
                const { error: msError } = await supabase
                    .from('roadmap_milestones')
                    .insert(validation.milestones.map((m, i) => ({
                        roadmap_id: id,
                        milestone_id: m.id,
                        sort_order: i,
                        label: m.label,
                        start_date: m.startDate,
                        end_date: m.endDate,
                        color: m.color,
                        updated_at: updatedAt,
                    })));
                if (msError) {
                    return NextResponse.json({ error: 'Failed to save milestones', message: msError.message }, { status: 500 });
                }
            }

            // Update roadmaps.updated_at
            await supabase.from('roadmaps').update({ updated_at: updatedAt }).eq('id', id);
        } else {
            const releaseName = patch.releaseName.trim();
            if (!releaseName) {
                return NextResponse.json({ error: 'Release name is required' }, { status: 400 });
            }

            // Update release name directly in roadmaps table
            const { error: metaError } = await supabase
                .from('roadmaps')
                .update({ release_name: releaseName, updated_at: updatedAt })
                .eq('id', id);

            if (metaError) {
                return NextResponse.json({ error: 'Failed to update release name', message: metaError.message }, { status: 500 });
            }
        }

        // Regenerate JSON blob backup
        await regenerateJsonBlob(id);

        // Reload document to return
        const document = await loadRoadmapDocumentFromRows(id);

        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId: id,
            outcome: 'success',
            status: 200,
            reason: patch.kind,
            serverVersion: updatedAt,
            actor: auth.sessionUser,
        });

        return NextResponse.json({ success: true, document, updatedAt });
    } catch (err) {
        let roadmapId = 'unknown';
        try { roadmapId = (await params).id; } catch { /* */ }
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: 'error',
            status: 500,
            reason: 'unexpected-exception',
        });
        console.error('Failed to patch roadmap:', err);
        return NextResponse.json({ error: 'Failed to patch roadmap', message: String(err) }, { status: 500 });
    }
}
