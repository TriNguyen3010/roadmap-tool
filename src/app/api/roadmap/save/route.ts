import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { buildVersionConflictPayload, normalizeVersion } from '@/utils/roadmapConcurrency';
import {
    resolveDocumentSaveRequest,
    sanitizeSharedRoadmapDocument,
    validateBaseVersion,
} from '@/utils/roadmapSaveFlow';

const ROW_ID = 'main';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const requestBody = await request.json();
        const { document: rawDocument, baseVersion } = resolveDocumentSaveRequest(requestBody);
        const data = sanitizeSharedRoadmapDocument(rawDocument);

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

        const versionCheck = validateBaseVersion(
            baseVersion,
            typeof currentRow.updated_at === 'string' ? currentRow.updated_at : null
        );
        if (!versionCheck.ok) {
            return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
        }
        const currentVersion = versionCheck.currentVersion;

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
