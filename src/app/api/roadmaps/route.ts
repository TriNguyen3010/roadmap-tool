import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';

export const runtime = 'nodejs';

// GET /api/roadmaps — list all roadmaps (id, name, updated_at)
// Reads name from content.releaseName so no extra DB column is needed.
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('roadmap_data')
            .select('id, content, updated_at')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const list = (data ?? []).map((row) => {
            const content = row.content as Record<string, unknown> | null;
            const name =
                typeof content?.releaseName === 'string' && content.releaseName.trim()
                    ? content.releaseName.trim()
                    : 'Untitled Roadmap';
            return { id: row.id, name, updated_at: row.updated_at };
        });

        return NextResponse.json(list);
    } catch (error) {
        console.error('Failed to list roadmaps:', error);
        return NextResponse.json({ error: 'Failed to list roadmaps' }, { status: 500 });
    }
}

// POST /api/roadmaps — create a new roadmap
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const name = typeof body?.name === 'string' && body.name.trim()
            ? body.name.trim()
            : 'Untitled Roadmap';

        // Generate a unique ID using crypto
        const { randomUUID } = await import('crypto');
        const id = randomUUID();

        const emptyDoc = {
            releaseName: name,
            startDate: '',
            endDate: '',
            milestones: [],
            items: [],
        };

        const { error } = await supabase
            .from('roadmap_data')
            .insert({ id, content: emptyDoc, updated_at: new Date().toISOString() });

        if (error) {
            console.error('Supabase insert error:', JSON.stringify(error));
            return NextResponse.json(
                { error: 'Supabase error', message: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ id, name }, { status: 201 });
    } catch (err) {
        console.error('Failed to create roadmap:', err);
        return NextResponse.json({ error: 'Failed to create roadmap', message: String(err) }, { status: 500 });
    }
}
