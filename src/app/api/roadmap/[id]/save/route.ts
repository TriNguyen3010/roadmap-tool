import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAdminLevel, type SessionUser, type TeamMemberRecord } from '@/types/auth';
import type { RoadmapDocument } from '@/types/roadmap';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';

export const runtime = 'nodejs';

type RequestMember = {
    sessionUser: SessionUser;
    member: TeamMemberRecord;
};

async function authenticateRequest(request: NextRequest): Promise<RequestMember | null> {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) return null;

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) return null;

    const email = user.email.trim();
    const { data: member } = await supabase
        .from('team_members')
        .select('email, role, team, label, is_active')
        .eq('email', email)
        .eq('is_active', true)
        .maybeSingle<TeamMemberRecord>();

    if (!member) return null;

    return {
        member,
        sessionUser: {
            email: member.email,
            role: member.role,
            team: member.team,
            label: member.label,
        },
    };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!isAdminLevel(auth.sessionUser)) {
            return NextResponse.json({ error: 'Manager-level should use /manager-save' }, { status: 403 });
        }

        const { id } = await params;
        const incoming = await request.json() as RoadmapDocument;
        const normalizedDoc: RoadmapDocument = {
            ...incoming,
            items: recalculateRoadmap(normalizeRoadmapItemTimestamps(Array.isArray(incoming.items) ? incoming.items : [])),
        };

        const { error } = await supabase
            .from('roadmap_data')
            .upsert(
                {
                    id,
                    content: normalizedDoc,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' }
            );

        if (error) {
            console.error('Supabase upsert error:', JSON.stringify(error));
            return NextResponse.json(
                { error: 'Supabase error', message: error.message, code: error.code, details: error.details },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error('Failed to save roadmap:', err);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(err) }, { status: 500 });
    }
}
