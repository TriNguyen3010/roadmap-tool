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

type JsonBackupPayload = {
    snapshot?: unknown;
    releaseName?: unknown;
};

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json() as JsonBackupPayload;
        const snapshot = payload.snapshot;
        if (!snapshot || typeof snapshot !== 'object') {
            return NextResponse.json({ error: 'Missing snapshot object' }, { status: 400 });
        }

        const rawReleaseName = typeof payload.releaseName === 'string'
            ? payload.releaseName
            : ((snapshot as { releaseName?: unknown }).releaseName as string | undefined);
        const baseName = sanitizeFileName(rawReleaseName || 'roadmap', 'roadmap').replace(/\s+/g, '_');
        const fileName = `${baseName}_backup_${buildTimestampTag()}.json`;

        const dir = resolveStorageDir(process.env.JSON_BACKUP_DIR, 'storage/json-backups');
        await ensureDir(dir);
        const outputPath = path.join(dir, fileName);

        const jsonContent = JSON.stringify(snapshot, null, 2);
        await writeFile(outputPath, `${jsonContent}\n`, 'utf8');

        return NextResponse.json({
            success: true,
            fileName,
            relativePath: toProjectRelativePath(outputPath),
        });
    } catch (error) {
        console.error('Failed to write JSON backup file:', error);
        return NextResponse.json({ error: 'Failed to write JSON backup file' }, { status: 500 });
    }
}
