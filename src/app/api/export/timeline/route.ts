import path from 'path';
import { writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import {
    buildTimestampTag,
    ensureDir,
    resolveStorageDir,
    sanitizeFileName,
    toProjectRelativePath,
} from '@/lib/storageFiles';

export const runtime = 'nodejs';

type TimelineExportPayload = {
    fileName?: unknown;
    contentBase64?: unknown;
};

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as TimelineExportPayload;
        const rawFileName = typeof payload.fileName === 'string' ? payload.fileName : '';
        const contentBase64 = typeof payload.contentBase64 === 'string' ? payload.contentBase64 : '';

        if (!contentBase64) {
            return NextResponse.json({ error: 'Missing contentBase64' }, { status: 400 });
        }

        const fallbackFileName = `roadmap_current-view_${buildTimestampTag()}.xlsx`;
        const safeBaseName = sanitizeFileName(rawFileName || fallbackFileName, fallbackFileName);
        const fileName = safeBaseName.toLowerCase().endsWith('.xlsx') ? safeBaseName : `${safeBaseName}.xlsx`;

        const dir = resolveStorageDir(process.env.TIMELINE_EXPORT_DIR, 'storage/timeline-exports');
        await ensureDir(dir);
        const outputPath = path.join(dir, fileName);

        const contentBuffer = Buffer.from(contentBase64, 'base64');
        await writeFile(outputPath, contentBuffer);

        return NextResponse.json({
            success: true,
            fileName,
            relativePath: toProjectRelativePath(outputPath),
        });
    } catch (error) {
        console.error('Failed to write timeline export file:', error);
        return NextResponse.json({ error: 'Failed to write timeline export file' }, { status: 500 });
    }
}
