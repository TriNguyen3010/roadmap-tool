import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import type { RoadmapDocument } from '@/types/roadmap';
import type { RoadmapSaveRequest } from '@/types/roadmapSave';
import { buildVersionConflictPayload, isMatchingVersion, normalizeVersion } from '@/utils/roadmapConcurrency';
import { stripViewSettingsFromDocument } from '@/utils/roadmapViewSettings';

const ROW_ID = 'main';

export const runtime = 'nodejs';

function resolveSaveRequest(body: unknown): RoadmapSaveRequest {
    if (body && typeof body === 'object' && 'document' in body) {
        const payload = body as Partial<RoadmapSaveRequest>;
        return {
            document: payload.document as RoadmapDocument,
            baseVersion: normalizeVersion(payload.baseVersion),
        };
    }

    return {
        document: body as RoadmapDocument,
        baseVersion: null,
    };
}

export async function POST(request: NextRequest) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const requestBody = await request.json();
        const { document: rawDocument, baseVersion } = resolveSaveRequest(requestBody);
        const data = stripViewSettingsFromDocument(rawDocument);
        if (!baseVersion) {
            return NextResponse.json({ error: 'Missing baseVersion' }, { status: 400 });
        }

        const { data: currentRow, error: readError } = await supabase
            .from('roadmap_data')
            .select('updated_at')
            .eq('id', ROW_ID)
            .maybeSingle();

        if (readError) {
            console.error('Failed to read roadmap before save:', JSON.stringify(readError));
            return NextResponse.json({ error: 'Failed to read roadmap version' }, { status: 500 });
        }

        if (!currentRow) {
            return NextResponse.json({ error: 'Roadmap not found' }, { status: 404 });
        }

        const currentVersion = normalizeVersion(typeof currentRow.updated_at === 'string' ? currentRow.updated_at : null);
        if (!isMatchingVersion(baseVersion, currentVersion)) {
            return NextResponse.json(buildVersionConflictPayload(currentVersion), { status: 409 });
        }

        const updatedAt = new Date().toISOString();
        let updateQuery = supabase
            .from('roadmap_data')
            .update({ content: data, updated_at: updatedAt })
            .eq('id', ROW_ID);

        updateQuery = currentVersion
            ? updateQuery.eq('updated_at', currentVersion)
            : updateQuery.is('updated_at', null);

        const { data: savedRow, error } = await updateQuery
            .select('updated_at')
            .maybeSingle();

        if (error) {
            console.error('Supabase conditional update error:', JSON.stringify(error));
            return NextResponse.json(
                { error: 'Supabase error', message: error.message, code: error.code, details: error.details },
                { status: 500 }
            );
        }

        if (!savedRow) {
            const { data: latestRow } = await supabase
                .from('roadmap_data')
                .select('updated_at')
                .eq('id', ROW_ID)
                .maybeSingle();

            return NextResponse.json(
                buildVersionConflictPayload(normalizeVersion(typeof latestRow?.updated_at === 'string' ? latestRow.updated_at : null)),
                { status: 409 }
            );
        }

        return NextResponse.json({ success: true, updatedAt });
    } catch (err: unknown) {
        console.error('Failed to save roadmap:', err);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(err) }, { status: 500 });
    }
}
