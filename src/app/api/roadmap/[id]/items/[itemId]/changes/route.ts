import { NextRequest, NextResponse } from 'next/server';
import { authenticateTeamRequest } from '@/lib/serverTeamAuth';
import { loadLatestChanges, loadChangeHistory, loadTeamChildrenIds } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

/**
 * GET /api/roadmap/[id]/items/[itemId]/changes
 *
 * Query params:
 *   mode=latest (default) — latest change per (team, field) for 3 key fields
 *   mode=full             — full paginated history
 *   limit=20              — page size (full mode only)
 *   offset=0              — pagination offset (full mode only)
 *   team=FE               — filter by team (full mode only)
 *
 * Parent aggregation: if the item has direct children of type 'team',
 * changes are loaded for those children instead of the item itself.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> }
) {
    const auth = await authenticateTeamRequest(request);
    if (!auth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: roadmapId, itemId } = await params;

    // Detect parent: if item has team children, query their changes
    const teamChildIds = await loadTeamChildrenIds(roadmapId, itemId);
    const targetIds = teamChildIds.length > 0 ? teamChildIds : [itemId];

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'latest';

    if (mode === 'latest') {
        const changes = await loadLatestChanges(roadmapId, targetIds);
        return NextResponse.json({ changes });
    }

    // Full history mode
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const team = url.searchParams.get('team') || undefined;

    const result = await loadChangeHistory(roadmapId, targetIds, { limit, offset, team });
    return NextResponse.json({
        changes: result.changes,
        total: result.total,
        limit,
        offset,
    });
}
