import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { isAdminLevel, type SessionUser, type TeamMemberRecord } from '@/types/auth';

export type AuthenticatedTeamRequest = {
    sessionUser: SessionUser;
    member: TeamMemberRecord;
};

async function resolveRequestEmail(request: NextRequest): Promise<string | null> {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user?.email) return null;
        return user.email.trim();
    }

    const supabaseServer = await createSupabaseServerClient();
    const { data: { user }, error } = await supabaseServer.auth.getUser();
    if (error || !user?.email) return null;
    return user.email.trim();
}

export async function authenticateTeamRequest(request: NextRequest): Promise<AuthenticatedTeamRequest | null> {
    const email = await resolveRequestEmail(request);
    if (!email) return null;

    const { data: member } = await supabase
        .from('team_members')
        .select('email, role, team, label, is_active')
        .eq('email', email)
        .eq('is_active', true)
        .maybeSingle();

    if (!member) return null;

    return {
        member: member as TeamMemberRecord,
        sessionUser: {
            email: (member as TeamMemberRecord).email,
            role: (member as TeamMemberRecord).role,
            team: (member as TeamMemberRecord).team,
            label: (member as TeamMemberRecord).label,
        },
    };
}

export async function authenticateAdminRequest(request: NextRequest): Promise<AuthenticatedTeamRequest | null> {
    const auth = await authenticateTeamRequest(request);
    if (!auth) return null;
    return isAdminLevel(auth.sessionUser) ? auth : null;
}
