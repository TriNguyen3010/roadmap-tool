import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const next = url.searchParams.get('next');
    const safeNext = next && next.startsWith('/') ? next : '/';

    if (code) {
        const supabase = await createSupabaseServerClient();
        await supabase.auth.exchangeCodeForSession(code);
    }

    return NextResponse.redirect(new URL(safeNext, request.url));
}
