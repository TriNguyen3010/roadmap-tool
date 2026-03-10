import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';
import { promises as fs } from 'fs';
import path from 'path';

const ROW_ID = 'main';
const LOCAL_DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_ROADMAP_FILE = path.join(LOCAL_DATA_DIR, 'roadmap.json');
const LOCAL_ROADMAP_TMP_FILE = path.join(LOCAL_DATA_DIR, 'roadmap.json.tmp');

export const runtime = 'nodejs';

async function writeRoadmapToLocalFile(data: unknown): Promise<void> {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(LOCAL_ROADMAP_TMP_FILE, content, 'utf8');
    await fs.rename(LOCAL_ROADMAP_TMP_FILE, LOCAL_ROADMAP_FILE);
}

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();

        const { error } = await supabase
            .from('roadmap_data')
            .upsert(
                { id: ROW_ID, content: data, updated_at: new Date().toISOString() },
                { onConflict: 'id' }
            );

        if (error) {
            console.error('Supabase upsert error:', JSON.stringify(error));
            return NextResponse.json(
                { error: 'Supabase error', message: error.message, code: error.code, details: error.details },
                { status: 500 }
            );
        }

        let fileWarning: string | undefined;
        try {
            await writeRoadmapToLocalFile(data);
        } catch (fileError: unknown) {
            console.error('Local roadmap file write warning:', fileError);
            fileWarning = 'Đã lưu cloud thành công nhưng không thể cập nhật file data/roadmap.json.';
        }

        return NextResponse.json({ success: true, fileWarning });
    } catch (err: unknown) {
        console.error('Failed to save roadmap:', err);
        return NextResponse.json({ error: 'Failed to write roadmap data', message: String(err) }, { status: 500 });
    }
}
