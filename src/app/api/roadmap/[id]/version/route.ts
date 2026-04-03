import { NextRequest, NextResponse } from 'next/server';
import { loadRoadmapVersion } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const updatedAt = await loadRoadmapVersion(id);

        return NextResponse.json(
            { updatedAt },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Failed to read roadmap version:', error);
        return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
    }
}
