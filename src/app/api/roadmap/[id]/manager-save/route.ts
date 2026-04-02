import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { isAdminLevel, type AuthManagerTeam, type ManagerFieldChange } from '@/types/auth';
import { TEAM_ROLES, type RoadmapDocument } from '@/types/roadmap';
import type { RoadmapManagerSaveRequest } from '@/types/roadmapSave';
import { buildVersionConflictPayload, isMatchingVersion, normalizeVersion } from '@/utils/roadmapConcurrency';
import { applyChangesToTree, validateManagerChanges } from '@/utils/permissionCheck';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';
import { stripViewSettingsFromDocument } from '@/utils/roadmapViewSettings';

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

        const body = await request.json().catch(() => ({})) as Partial<RoadmapManagerSaveRequest>;
        const changes = Array.isArray(body?.changes) ? body.changes as ManagerFieldChange[] : [];
        const baseVersion = normalizeVersion(body?.baseVersion);
        if (changes.length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }
        if (!baseVersion) {
            return NextResponse.json({ error: 'Missing baseVersion' }, { status: 400 });
        }

        const { id } = await params;
        const { data: row, error: fetchError } = await supabase
            .from('roadmap_data')
            .select('content, updated_at')
            .eq('id', id)
            .maybeSingle();

        if (fetchError || !row?.content) {
            return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
        }

        const currentVersion = normalizeVersion(typeof row.updated_at === 'string' ? row.updated_at : null);
        if (!isMatchingVersion(baseVersion, currentVersion)) {
            return NextResponse.json(buildVersionConflictPayload(currentVersion), { status: 409 });
        }

        const currentDoc = row.content as RoadmapDocument;
        const currentItems = normalizeRoadmapItemTimestamps(Array.isArray(currentDoc.items) ? currentDoc.items : []);
        const validation = validateManagerChanges(managerTeam as AuthManagerTeam, changes, currentItems);

        if (!validation.valid) {
            return NextResponse.json({
                error: 'Permission denied',
                violations: validation.violations,
            }, { status: 403 });
        }

        const updatedItems = applyChangesToTree(currentItems, changes);
        const recalculatedItems = recalculateRoadmap(updatedItems);
        const savedDoc: RoadmapDocument = {
            ...stripViewSettingsFromDocument(currentDoc),
            items: recalculatedItems,
        };

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
            return NextResponse.json({ error: 'Failed to save roadmap', message: saveError.message }, { status: 500 });
        }

        if (!savedRow) {
            const { data: latestRow } = await supabase
                .from('roadmap_data')
                .select('updated_at')
                .eq('id', id)
                .maybeSingle();

            return NextResponse.json(
                buildVersionConflictPayload(normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null)),
                { status: 409 }
            );
        }

        return NextResponse.json({ success: true, document: savedDoc, updatedAt });
    } catch (error) {
        console.error('Failed manager-save:', error);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(error) }, { status: 500 });
    }
}
