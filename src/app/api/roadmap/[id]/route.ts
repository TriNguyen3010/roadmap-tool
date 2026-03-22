import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';

export const runtime = 'nodejs';

// GET /api/roadmap/[id] — load a specific roadmap's content
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data, error } = await supabase
            .from('roadmap_data')
            .select('content')
            .eq('id', id)
            .single();

        if (error) throw error;

        return NextResponse.json(data.content);
    } catch (error) {
        console.error('Failed to read roadmap:', error);
        return NextResponse.json({ error: 'Failed to read roadmap data' }, { status: 500 });
    }
}

// DELETE /api/roadmap/[id] — delete a roadmap (requires editor auth)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const { error } = await supabase
            .from('roadmap_data')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Supabase delete error:', JSON.stringify(error));
            return NextResponse.json({ error: 'Supabase error', message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Failed to delete roadmap:', err);
        return NextResponse.json({ error: 'Failed to delete roadmap', message: String(err) }, { status: 500 });
    }
}
