import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { isAdminLevel, type AuthManagerTeam, type ManagerFieldChange } from '@/types/auth';
import { TEAM_ROLES, type RoadmapDocument } from '@/types/roadmap';
import { applyChangesToTree, validateManagerChanges } from '@/utils/permissionCheck';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';

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
        const changes = Array.isArray(body?.changes) ? body.changes as ManagerFieldChange[] : [];
        if (changes.length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }

        const { id } = await params;
        const { data: row, error: fetchError } = await supabase
            .from('roadmap_data')
            .select('content')
            .eq('id', id)
            .single();

        if (fetchError || !row?.content) {
            return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
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
            ...currentDoc,
            items: recalculatedItems,
        };

        const updatedAt = new Date().toISOString();
        const { error: saveError } = await supabase
            .from('roadmap_data')
            .upsert(
                {
                    id,
                    content: savedDoc,
                    updated_at: updatedAt,
                },
                { onConflict: 'id' }
            );

        if (saveError) {
            return NextResponse.json({ error: 'Failed to save roadmap', message: saveError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, document: savedDoc, updatedAt });
    } catch (error) {
        console.error('Failed manager-save:', error);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(error) }, { status: 500 });
    }
}
