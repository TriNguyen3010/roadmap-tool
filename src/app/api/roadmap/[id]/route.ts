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

export const runtime = 'nodejs';

// GET /api/roadmap/[id] — load a specific roadmap's content
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data, error } = await supabase
            .from('roadmap_data')
            .select('content')
            .eq('id', id)
            .single();

        if (error) throw error;

        return NextResponse.json(data.content);
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

        const { data: row, error: readError } = await supabase
            .from('roadmap_data')
            .select('content, updated_at')
            .eq('id', id)
            .maybeSingle();

        if (readError) {
            logRoadmapSaveTelemetry({
                route: 'admin-patch',
                roadmapId: id,
                outcome: 'error',
                status: 500,
                reason: 'read-version-failed',
                baseVersion: patch.baseVersion,
                actor: auth.sessionUser,
            });
            return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
        }

        if (!row?.content) {
            return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
        }

        const versionCheck = validateBaseVersion(
            patch.baseVersion,
            typeof row.updated_at === 'string' ? row.updated_at : null
        );
        if (!versionCheck.ok) {
            logRoadmapSaveTelemetry({
                route: 'admin-patch',
                roadmapId: id,
                outcome: versionCheck.status === 409 ? 'conflict' : 'rejected',
                status: versionCheck.status,
                reason: versionCheck.status === 409 ? 'stale-base-version' : 'missing-base-version',
                baseVersion: patch.baseVersion,
                serverVersion: versionCheck.payload.serverVersion ?? null,
                actor: auth.sessionUser,
            });
            return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
        }

        const currentVersion = versionCheck.currentVersion;
        const currentDoc = sanitizeSharedRoadmapDocument(row.content as RoadmapDocument);
        let nextDoc: RoadmapDocument;

        if (patch.kind === 'milestones') {
            const validation = validateNormalizedMilestones(patch.milestones);
            if (!validation.ok) {
                logRoadmapSaveTelemetry({
                    route: 'admin-patch',
                    roadmapId: id,
                    outcome: 'rejected',
                    status: 400,
                    reason: 'invalid-milestones',
                    baseVersion: patch.baseVersion,
                    actor: auth.sessionUser,
                });
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }

            nextDoc = {
                ...currentDoc,
                milestones: validation.milestones,
            };
        } else {
            const releaseName = patch.releaseName.trim();
            if (!releaseName) {
                logRoadmapSaveTelemetry({
                    route: 'admin-patch',
                    roadmapId: id,
                    outcome: 'rejected',
                    status: 400,
                    reason: 'invalid-release-name',
                    baseVersion: patch.baseVersion,
                    actor: auth.sessionUser,
                });
                return NextResponse.json({ error: 'Release name is required' }, { status: 400 });
            }

            nextDoc = {
                ...currentDoc,
                releaseName,
            };
        }

        const updatedAt = new Date().toISOString();
        let saveQuery = supabase
            .from('roadmap_data')
            .update({
                content: nextDoc,
                updated_at: updatedAt,
            })
            .eq('id', id);

        saveQuery = currentVersion
            ? saveQuery.eq('updated_at', currentVersion)
            : saveQuery.is('updated_at', null);

        const { data: savedRow, error: saveError } = await saveQuery
            .select('updated_at')
            .maybeSingle();

        if (saveError) {
            logRoadmapSaveTelemetry({
                route: 'admin-patch',
                roadmapId: id,
                outcome: 'error',
                status: 500,
                reason: 'conditional-update-failed',
                baseVersion: patch.baseVersion,
                actor: auth.sessionUser,
            });
            return NextResponse.json({ error: 'Failed to save roadmap', message: saveError.message }, { status: 500 });
        }

        if (!savedRow) {
            const { data: latestRow } = await supabase
                .from('roadmap_data')
                .select('updated_at')
                .eq('id', id)
                .maybeSingle();

            const serverVersion = normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null);
            logRoadmapSaveTelemetry({
                route: 'admin-patch',
                roadmapId: id,
                outcome: 'conflict',
                status: 409,
                reason: 'conditional-update-miss',
                baseVersion: patch.baseVersion,
                serverVersion,
                actor: auth.sessionUser,
            });

            return NextResponse.json(buildVersionConflictPayload(serverVersion), { status: 409 });
        }

        const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;

        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId: id,
            outcome: 'success',
            status: 200,
            reason: patch.kind,
            baseVersion: patch.baseVersion,
            serverVersion: persistedVersion,
            actor: auth.sessionUser,
        });

        return NextResponse.json({ success: true, document: nextDoc, updatedAt: persistedVersion });
    } catch (err) {
        let roadmapId = 'unknown';
        try {
            roadmapId = (await params).id;
        } catch {
            roadmapId = 'unknown';
        }
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
