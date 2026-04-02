import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import type { RoadmapDocument } from '@/types/roadmap';
import { normalizeRoadmapItemTimestamps, recalculateRoadmap } from '@/utils/roadmapHelpers';

export const runtime = 'nodejs';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
