'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import type { SessionUser, TeamMemberRecord } from '@/types/auth';

const TEAM_MEMBER_COLUMNS = 'role, team, label, is_active';

function toSessionUser(email: string, member: TeamMemberRecord): SessionUser {
    return {
        email,
        role: member.role,
        team: member.team,
        label: member.label,
    };
}

export function useGoogleAuth() {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const lookupTeamMember = useCallback(async (email: string) => {
        const { data, error: dbError } = await supabaseBrowser
            .from('team_members')
            .select(TEAM_MEMBER_COLUMNS)
            .eq('email', email)
            .maybeSingle<TeamMemberRecord>();

        if (dbError || !data) {
            setUser(null);
            setError(`Tài khoản ${email} chưa được cấp quyền. Liên hệ Admin.`);
            return null;
        }

        if (!data.is_active) {
            setUser(null);
            setError(`Tài khoản ${email} đã bị vô hiệu hoá. Liên hệ Admin.`);
            return null;
        }

        const nextUser = toSessionUser(email, data);
        setUser(nextUser);
        setError(null);
        return nextUser;
    }, []);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                const { data } = await supabaseBrowser.auth.getSession();
                if (!mounted) return;

                const nextSession = data.session ?? null;
                setSession(nextSession);

                const email = nextSession?.user?.email;
                if (email) {
                    await lookupTeamMember(email);
                } else {
                    setUser(null);
                    setError(null);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void init();

        const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);

            const email = nextSession?.user?.email;
            if (!email) {
                setUser(null);
                setError(null);
                return;
            }

            void lookupTeamMember(email);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [lookupTeamMember]);

    const loginWithGoogle = useCallback(async (nextPath?: string) => {
        setError(null);

        const next = nextPath || window.location.pathname;
        const callbackUrl = new URL('/auth/callback', window.location.origin);
        callbackUrl.searchParams.set('next', next);

        const { error: signInError } = await supabaseBrowser.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl.toString(),
            },
        });

        if (signInError) throw signInError;
    }, []);

    const logout = useCallback(async () => {
        await supabaseBrowser.auth.signOut();
        setSession(null);
        setUser(null);
        setError(null);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        user,
        session,
        accessToken: session?.access_token ?? null,
        loading,
        error,
        clearError,
        loginWithGoogle,
        logout,
    };
}
