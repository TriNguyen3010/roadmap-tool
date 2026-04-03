import { NextRequest, NextResponse } from 'next/server';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { isAdminLevel, type AuthManagerTeam } from '@/types/auth';
import { TEAM_ROLES, type ItemStatus } from '@/types/roadmap';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import {
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
 * POST /api/roadmap/[id]/manager-save — Manager row-level save (table-based, last-write-wins).
 *
 * Receives field-level changes, validates team permissions per-row,
 * and updates individual rows in roadmap_items. No document-level locking.
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
        const changes: Array<{ itemId: string; team?: string; field: string; value: unknown }> = Array.isArray(body?.changes) ? body.changes : [];
        if (changes.length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }

        const { id: roadmapId } = await params;
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

    // Multi-team: check if the specified team is in assignedTeams
    if (item.assignedTeams && changeTeam && item.assignedTeams.includes(changeTeam)) {
        return changeTeam;
    }

    // Single-team items or team nodes
    if (item.teamRole) return item.teamRole;

    // Walk up ancestors to find nearest team node
    for (let i = 1; i < chain.length; i++) {
        if (chain[i].teamRole) return chain[i].teamRole!;
    }

    return null;
}
