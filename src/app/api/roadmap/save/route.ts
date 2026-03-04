import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';

const ROW_ID = 'main';

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();

        const { error } = await supabase
            .from('roadmap_data')
            .upsert(
                { id: ROW_ID, content: data, updated_at: new Date().toISOString() },
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
