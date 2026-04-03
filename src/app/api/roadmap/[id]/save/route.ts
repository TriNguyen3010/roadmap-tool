import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { normalizeSharedRoadmapDocument } from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import { fullDocumentSync } from '@/server/roadmapRowsRepo';

export const runtime = 'nodejs';

/**
 * POST /api/roadmap/[id]/save — Admin full-document save (table-based, last-write-wins).
 *
 * Receives the full RoadmapDocument, normalizes it, diffs against current rows,
 * and applies inserts/updates/deletes. JSON blob is regenerated as backup.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const requestBody = await request.json();
        const incoming = requestBody?.document;

        if (!incoming || typeof incoming !== 'object') {
            return NextResponse.json({ error: 'Missing document in request body' }, { status: 400 });
        }

        const normalizedDoc = normalizeSharedRoadmapDocument(incoming);

        const result = await fullDocumentSync(id, normalizedDoc);

        if (!result.success) {
            logRoadmapSaveTelemetry({
                route: 'admin-save',
                roadmapId: id,
                outcome: 'error',
                status: 500,
                reason: result.error ?? 'sync-failed',
                actor: auth.sessionUser,
            });
            return NextResponse.json(
                { error: 'Failed to save roadmap', message: result.error },
                { status: 500 }
            );
        }

        logRoadmapSaveTelemetry({
            route: 'admin-save',
            roadmapId: id,
            outcome: 'success',
            status: 200,
            serverVersion: result.updatedAt,
            actor: auth.sessionUser,
        });

        return NextResponse.json({ success: true, updatedAt: result.updatedAt });
    } catch (err: unknown) {
        const { id } = await params;
        logRoadmapSaveTelemetry({
            route: 'admin-save',
            roadmapId: id,
            outcome: 'error',
            status: 500,
            reason: 'unexpected-exception',
        });
        console.error('Failed to save roadmap:', err);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(err) }, { status: 500 });
    }
}
