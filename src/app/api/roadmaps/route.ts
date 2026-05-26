import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { filterVisibleRoadmaps } from '@/utils/roadmapVisibility';

export const runtime = 'nodejs';

// GET /api/roadmaps — list all roadmaps (id, name, updated_at)
// Merges legacy (roadmap_data) and new (roadmaps table) sources.
export async function GET() {
    try {
        // Read from roadmaps table (covers both json and table mode)
        const { data: roadmapRows, error: roadmapError } = await supabase
            .from('roadmaps')
            .select('id, release_name, updated_at, storage_mode')
            .order('updated_at', { ascending: false });

        if (roadmapError) throw roadmapError;

        // If roadmaps table has data, use it as source
        if (roadmapRows && roadmapRows.length > 0) {
            const list = roadmapRows.map((row) => ({
                id: row.id,
                name: row.release_name || 'Untitled Roadmap',
                updated_at: row.updated_at,
                storage_mode: row.storage_mode || 'json',
            }));
            return NextResponse.json(filterVisibleRoadmaps(list));
        }

        // Fallback: read from roadmap_data (for projects that haven't run backfill yet)
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
            return { id: row.id, name, updated_at: row.updated_at, storage_mode: 'json' };
        });

        return NextResponse.json(filterVisibleRoadmaps(list));
    } catch (error) {
        console.error('Failed to list roadmaps:', error);
        return NextResponse.json({ error: 'Failed to list roadmaps' }, { status: 500 });
    }
}

// POST /api/roadmaps — create a new roadmap (uses table-based storage)
export async function POST(request: NextRequest) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const name = typeof body?.name === 'string' && body.name.trim()
            ? body.name.trim()
            : 'Untitled Roadmap';

        const { randomUUID } = await import('crypto');
        const id = randomUUID();
        const now = new Date().toISOString();

        // Create in roadmaps table with storage_mode = 'table'
        const { error: roadmapError } = await supabase
            .from('roadmaps')
            .insert({
                id,
                release_name: name,
                start_date: '',
                end_date: '',
                storage_mode: 'table',
                created_at: now,
                updated_at: now,
            });

        if (roadmapError) {
            console.error('Supabase insert roadmaps error:', JSON.stringify(roadmapError));
            return NextResponse.json({ error: 'Supabase error', message: roadmapError.message }, { status: 500 });
        }

        // Also create a backup JSON blob entry
        const emptyDoc = { releaseName: name, startDate: '', endDate: '', milestones: [], items: [] };
        await supabase
            .from('roadmap_data')
            .insert({ id, content: emptyDoc, updated_at: now, storage_mode: 'table' });

        return NextResponse.json({ id, name }, { status: 201 });
    } catch (err) {
        console.error('Failed to create roadmap:', err);
        return NextResponse.json({ error: 'Failed to create roadmap', message: String(err) }, { status: 500 });
    }
}
