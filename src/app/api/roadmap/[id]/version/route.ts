import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getStorageMode, loadRoadmapVersion } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const mode = await getStorageMode(id);
        console.log(`[version] roadmap=${id} storageMode=${mode}`);

        if (mode === 'json') {
            // Legacy: read from roadmap_data
            const { data, error } = await supabase
                .from('roadmap_data')
                .select('updated_at')
                .eq('id', id)
                .single();
            if (error) throw error;
            return NextResponse.json(
                { updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null, storageMode: 'json' },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // Table-based: read from roadmaps table
        const updatedAt = await loadRoadmapVersion(id);
        return NextResponse.json(
            { updatedAt, storageMode: 'table' },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Failed to read roadmap version:', error);
        return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
    }
}
