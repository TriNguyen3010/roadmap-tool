import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { isAdminLevel, type AuthManagerTeam } from '@/types/auth';
import { TEAM_ROLES, type RoadmapDocument } from '@/types/roadmap';
import { buildVersionConflictPayload, normalizeVersion } from '@/utils/roadmapConcurrency';
import { applyChangesToTree, validateManagerChanges } from '@/utils/permissionCheck';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';
import {
    resolveManagerSaveRequest,
    sanitizeSharedRoadmapDocument,
    validateBaseVersion,
} from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';

export const runtime = 'nodejs';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateTeamRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (isAdminLevel(auth.sessionUser)) {
            return NextResponse.json({ error: 'Admin-level should use /save endpoint' }, { status: 400 });
        }

        const managerTeam = auth.member.team;
        if (!managerTeam || auth.member.role !== 'manager' || !TEAM_ROLES.includes(managerTeam as AuthManagerTeam)) {
            return NextResponse.json({ error: 'Not a manager account' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const { changes, baseVersion } = resolveManagerSaveRequest(body);
        if (changes.length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }

        const { id } = await params;
        const MAX_RETRY = 3;
        let attempt = 0;
        let lastRetryError: string | null = null;

        while (attempt < MAX_RETRY) {
            attempt++;

            // 1. Read latest document from DB
            const { data: row, error: fetchError } = await supabase
                .from('roadmap_data')
                .select('content, updated_at')
                .eq('id', id)
                .maybeSingle();

            if (fetchError || !row?.content) {
                return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
            }

            // On first attempt, validate baseVersion from client
            if (attempt === 1) {
                const versionCheck = validateBaseVersion(
                    baseVersion,
                    typeof row.updated_at === 'string' ? row.updated_at : null
                );
                if (!versionCheck.ok) {
                    logRoadmapSaveTelemetry({
                        route: 'manager-save',
                        roadmapId: id,
                        outcome: versionCheck.status === 409 ? 'conflict' : 'rejected',
                        status: versionCheck.status,
                        reason: versionCheck.status === 409 ? 'stale-base-version' : 'missing-base-version',
                        baseVersion,
                        serverVersion: versionCheck.payload.serverVersion ?? null,
                        changeCount: changes.length,
                        actor: auth.sessionUser,
                    });
                    return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
                }
            }

            const currentVersion = typeof row.updated_at === 'string' ? row.updated_at : null;
            const currentDoc = row.content as RoadmapDocument;
            const currentItems = normalizeRoadmapItemTimestamps(Array.isArray(currentDoc.items) ? currentDoc.items : []);

            // 2. Validate changes against latest data
            const validation = validateManagerChanges(managerTeam as AuthManagerTeam, changes, currentItems);
            if (!validation.valid) {
                logRoadmapSaveTelemetry({
                    route: 'manager-save',
                    roadmapId: id,
                    outcome: 'rejected',
                    status: 403,
                    reason: 'permission-denied',
                    baseVersion,
                    changeCount: changes.length,
                    actor: auth.sessionUser,
                });
                return NextResponse.json({
                    error: 'Permission denied',
                    violations: validation.violations,
                }, { status: 403 });
            }

            // 3. Apply changes + recalculate
            const updatedItems = applyChangesToTree(currentItems, changes);
            const recalculatedItems = recalculateRoadmap(updatedItems);
            const savedDoc: RoadmapDocument = {
                ...sanitizeSharedRoadmapDocument(currentDoc),
                items: recalculatedItems,
            };

            // 4. Conditional update (optimistic lock)
            const updatedAt = new Date().toISOString();
            let saveQuery = supabase
                .from('roadmap_data')
                .update({
                    content: savedDoc,
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
                    route: 'manager-save',
                    roadmapId: id,
                    outcome: 'error',
                    status: 500,
                    reason: 'conditional-update-failed',
                    baseVersion,
                    changeCount: changes.length,
                    actor: auth.sessionUser,
                });
                return NextResponse.json({ error: 'Failed to save roadmap', message: saveError.message }, { status: 500 });
            }

            if (savedRow) {
                const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;

                // SUCCESS
                logRoadmapSaveTelemetry({
                    route: 'manager-save',
                    roadmapId: id,
                    outcome: 'success',
                    status: 200,
                    baseVersion,
                    serverVersion: persistedVersion,
                    changeCount: changes.length,
                    actor: auth.sessionUser,
                });
                return NextResponse.json({ success: true, document: savedDoc, updatedAt: persistedVersion });
            }

            // Conditional update missed → someone else saved first, retry
            lastRetryError = `Attempt ${attempt}: version conflict, retrying...`;
        }

        // Retry exhausted
        const { data: latestRow } = await supabase
            .from('roadmap_data')
            .select('updated_at')
            .eq('id', id)
            .maybeSingle();

        const serverVersion = normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null);
        logRoadmapSaveTelemetry({
            route: 'manager-save',
            roadmapId: id,
            outcome: 'conflict',
            status: 409,
            reason: 'retry-exhausted',
            baseVersion,
            serverVersion,
            changeCount: changes.length,
            actor: auth.sessionUser,
        });

        const conflictPayload = buildVersionConflictPayload(serverVersion);
        return NextResponse.json({
            ...conflictPayload,
            error: 'Không thể lưu sau nhiều lần thử. Vui lòng tải lại trang.',
            code: 'RETRY_EXHAUSTED',
            details: lastRetryError,
        }, { status: 409 });
    } catch (error) {
        let roadmapId = 'unknown';
        try {
            roadmapId = (await params).id;
        } catch {
            roadmapId = 'unknown';
        }
        logRoadmapSaveTelemetry({
            route: 'manager-save',
            roadmapId,
            outcome: 'error',
            status: 500,
            reason: 'unexpected-exception',
        });
        console.error('Failed manager-save:', error);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(error) }, { status: 500 });
    }
}
