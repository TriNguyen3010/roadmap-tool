import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { isAdminLevel, type AuthManagerTeam } from '@/types/auth';
import { TEAM_ROLES, type RoadmapDocument, type ItemStatus } from '@/types/roadmap';
import { buildVersionConflictPayload, normalizeVersion } from '@/utils/roadmapConcurrency';
import { applyChangesToTree, validateManagerChanges } from '@/utils/permissionCheck';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';
import { resolveManagerSaveRequest, sanitizeSharedRoadmapDocument, validateBaseVersion } from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import {
    getStorageMode,
    loadItemWithAncestors,
    loadRoadmapDocumentFromRows,
    updateItemFields,
    regenerateJsonBlob,
    type ItemFieldPatch,
} from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

/** Allowed fields for manager row-level updates. */
const MANAGER_ALLOWED_FIELDS = new Set(['status', 'startDate', 'endDate', 'quickNote']);

/**
 * POST /api/roadmap/[id]/manager-save — Manager save.
 * Routes to legacy JSON flow or table-based flow based on storage_mode.
 */
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
        const { id: roadmapId } = await params;
        const mode = await getStorageMode(roadmapId);

        if (mode === 'json') {
            return managerSaveLegacyJson(roadmapId, managerTeam as AuthManagerTeam, body, auth);
        }

        const changes: Array<{ itemId: string; team?: string; field: string; value: unknown }> = Array.isArray(body?.changes) ? body.changes : [];
        if (changes.length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }
        const violations: string[] = [];

        // Validate and apply each change as a row-level update
        for (const change of changes) {
            // Validate field is allowed
            if (!MANAGER_ALLOWED_FIELDS.has(change.field)) {
                violations.push(`Field "${change.field}" is not editable by managers`);
                continue;
            }

            // Load item + ancestors to determine team ownership
            const chain = await loadItemWithAncestors(roadmapId, change.itemId);
            if (chain.length === 0) {
                violations.push(`Item "${change.itemId}" not found`);
                continue;
            }

            const item = chain[0];

            // Check team permission: item must belong to manager's team
            const itemTeam = resolveItemTeam(chain, change.team);
            if (itemTeam !== managerTeam) {
                violations.push(`Item "${change.itemId}" does not belong to team ${managerTeam}`);
                continue;
            }

            // Build field patch for this row
            const patch: ItemFieldPatch = {};

            if (change.field === 'status') {
                const value = change.value as ItemStatus;
                if (item.assignedTeams && item.teamStatuses && change.team) {
                    // Multi-team item: update the specific team's status within teamStatuses
                    const updatedTeamStatuses = {
                        ...item.teamStatuses,
                        [change.team]: {
                            ...(item.teamStatuses[change.team as keyof typeof item.teamStatuses] || {}),
                            status: value,
                            statusMode: 'manual' as const,
                            manualStatus: value,
                        },
                    };
                    patch.teamStatuses = updatedTeamStatuses;
                } else {
                    // Single-team item: update status directly
                    patch.status = value;
                    patch.statusMode = 'manual';
                    patch.manualStatus = value;
                }
            } else if (change.field === 'startDate') {
                if (item.assignedTeams && item.teamStatuses && change.team) {
                    const updatedTeamStatuses = {
                        ...item.teamStatuses,
                        [change.team]: {
                            ...(item.teamStatuses[change.team as keyof typeof item.teamStatuses] || {}),
                            startDate: change.value as string,
                        },
                    };
                    patch.teamStatuses = updatedTeamStatuses;
                } else {
                    patch.startDate = (change.value as string) || null;
                }
            } else if (change.field === 'endDate') {
                if (item.assignedTeams && item.teamStatuses && change.team) {
                    const updatedTeamStatuses = {
                        ...item.teamStatuses,
                        [change.team]: {
                            ...(item.teamStatuses[change.team as keyof typeof item.teamStatuses] || {}),
                            endDate: change.value as string,
                        },
                    };
                    patch.teamStatuses = updatedTeamStatuses;
                } else {
                    patch.endDate = (change.value as string) || null;
                }
            } else if (change.field === 'quickNote') {
                patch.quickNote = (change.value as string) || null;
            }

            const result = await updateItemFields(roadmapId, change.itemId, patch);
            if (!result.success) {
                violations.push(`Failed to update item "${change.itemId}": ${result.error}`);
            }
        }

        if (violations.length > 0 && violations.length === changes.length) {
            // All changes failed
            logRoadmapSaveTelemetry({
                route: 'manager-save',
                roadmapId,
                outcome: 'rejected',
                status: 403,
                reason: 'permission-denied',
                changeCount: changes.length,
                actor: auth.sessionUser,
            });
            return NextResponse.json({ error: 'Permission denied', violations }, { status: 403 });
        }

        // Regenerate JSON blob backup
        await regenerateJsonBlob(roadmapId);

        // Reload full document to return to client
        const document = await loadRoadmapDocumentFromRows(roadmapId);
        const updatedAt = new Date().toISOString();

        logRoadmapSaveTelemetry({
            route: 'manager-save',
            roadmapId,
            outcome: 'success',
            status: 200,
            changeCount: changes.length,
            actor: auth.sessionUser,
        });

        return NextResponse.json({
            success: true,
            document,
            updatedAt,
            ...(violations.length > 0 ? { warnings: violations } : {}),
        });
    } catch (error) {
        let roadmapId = 'unknown';
        try { roadmapId = (await params).id; } catch { /* */ }
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

/**
 * Resolve the team that an item belongs to by walking up the ancestor chain.
 * Priority: assignedTeams (with change.team) → item.teamRole → parent team nodes.
 */
function resolveItemTeam(
    chain: Array<{ teamRole?: string; assignedTeams?: string[] }>,
    changeTeam?: string
): string | null {
    const item = chain[0];
    if (item.assignedTeams && changeTeam && item.assignedTeams.includes(changeTeam)) return changeTeam;
    if (item.teamRole) return item.teamRole;
    for (let i = 1; i < chain.length; i++) {
        if (chain[i].teamRole) return chain[i].teamRole!;
    }
    return null;
}

// ── Legacy JSON manager save (optimistic locking + retry) ────────────────────

async function managerSaveLegacyJson(
    roadmapId: string,
    managerTeam: AuthManagerTeam,
    body: Record<string, unknown>,
    auth: { sessionUser: unknown; member: { team: string; role: string } }
) {
    const { changes, baseVersion } = resolveManagerSaveRequest(body);
    if (changes.length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    const MAX_RETRY = 3;
    let attempt = 0;

    while (attempt < MAX_RETRY) {
        attempt++;

        const { data: row, error: fetchError } = await supabase
            .from('roadmap_data').select('content, updated_at').eq('id', roadmapId).maybeSingle();
        if (fetchError || !row?.content) return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });

        if (attempt === 1) {
            const versionCheck = validateBaseVersion(baseVersion, typeof row.updated_at === 'string' ? row.updated_at : null);
            if (!versionCheck.ok) return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
        }

        const currentVersion = typeof row.updated_at === 'string' ? row.updated_at : null;
        const currentDoc = row.content as RoadmapDocument;
        const currentItems = normalizeRoadmapItemTimestamps(Array.isArray(currentDoc.items) ? currentDoc.items : []);

        const validation = validateManagerChanges(managerTeam, changes, currentItems);
        if (!validation.valid) {
            return NextResponse.json({ error: 'Permission denied', violations: validation.violations }, { status: 403 });
        }

        const updatedItems = applyChangesToTree(currentItems, changes);
        const recalculatedItems = recalculateRoadmap(updatedItems);
        const savedDoc: RoadmapDocument = { ...sanitizeSharedRoadmapDocument(currentDoc), items: recalculatedItems };

        const updatedAt = new Date().toISOString();
        let saveQuery = supabase.from('roadmap_data').update({ content: savedDoc, updated_at: updatedAt }).eq('id', roadmapId);
        saveQuery = currentVersion ? saveQuery.eq('updated_at', currentVersion) : saveQuery.is('updated_at', null);
        const { data: savedRow, error: saveError } = await saveQuery.select('updated_at').maybeSingle();

        if (saveError) return NextResponse.json({ error: 'Failed to save', message: saveError.message }, { status: 500 });

        if (savedRow) {
            const persistedVersion = normalizeVersion(typeof savedRow.updated_at === 'string' ? savedRow.updated_at : updatedAt) ?? updatedAt;
            logRoadmapSaveTelemetry({ route: 'manager-save', roadmapId, outcome: 'success', status: 200, baseVersion, serverVersion: persistedVersion, changeCount: changes.length, actor: auth.sessionUser });
            return NextResponse.json({ success: true, document: savedDoc, updatedAt: persistedVersion });
        }
    }

    // Retry exhausted
    const { data: latestRow } = await supabase.from('roadmap_data').select('updated_at').eq('id', roadmapId).maybeSingle();
    const serverVersion = normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null);
    return NextResponse.json(buildVersionConflictPayload(serverVersion), { status: 409 });
}
