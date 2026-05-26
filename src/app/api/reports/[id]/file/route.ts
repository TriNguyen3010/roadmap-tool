import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportById, getReportStoragePath, updateReport } from '@/server/reportsRepo';
import { deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

// mammoth + sanitizeReportHtml are lazy-loaded inside PUT so the module's
// cold-start stays light enough for Vercel Lambda init. See the matching
// comment in src/app/api/reports/route.ts.

export const runtime = 'nodejs';

const MAX_MB = readPositiveIntEnv('REPORT_UPLOAD_MAX_MB', 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);

    let newStoragePath: string | null = null;
    let oldStoragePath: string | null = null;

    // Lazy import heavy deps so /api/reports/[id]/file module init doesn't
    // touch mammoth on Vercel cold-start.
    const [
        { default: mammoth },
        { sanitizeReportHtml },
        { buildStoragePath },
        { uploadReportFile },
    ] = await Promise.all([
        import('mammoth'),
        import('@/utils/sanitizeReportHtml'),
        import('@/utils/reportFilename'),
        import('@/lib/reportsStorage'),
    ]);

    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-replace-file',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: RATE_MAX,
            windowMs: RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many file replaces', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const existing = await getReportById(id);
        if (!existing) return err('NOT_FOUND', 'Report not found', 404, requestId);
        // Fetch storage path separately because Report wire type intentionally omits it.
        oldStoragePath = await getReportStoragePath(id);
        if (!oldStoragePath) return err('NOT_FOUND', 'Report storage path missing', 404, requestId);

        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return err('NO_FILE', 'File is required', 400, requestId);
        if (!file.name.toLowerCase().endsWith('.docx')) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.type && file.type !== DOCX_MIME) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.size > MAX_BYTES) {
            return err('FILE_TOO_LARGE', `File exceeds ${MAX_MB}MB`, 400, requestId);
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        let rawHtml = '';
        let rawText = '';
        try {
            const [htmlOut, textOut] = await Promise.all([
                mammoth.convertToHtml({ buffer }),
                mammoth.extractRawText({ buffer }),
            ]);
            rawHtml = htmlOut.value;
            rawText = textOut.value;
        } catch (parseError) {
            console.error(`[reports.file.PUT:${requestId}] mammoth failed`, parseError);
            return err('PARSE_FAILED', 'Could not parse .docx', 422, requestId);
        }

        const cleanHtml = sanitizeReportHtml(rawHtml);
        const newUuid = randomUUID();
        newStoragePath = buildStoragePath(existing.month, newUuid, file.name);

        const uploadResult = await uploadReportFile({ storagePath: newStoragePath, buffer });
        if (!uploadResult.ok) {
            return err('STORAGE_ERROR', 'Storage upload failed', 500, requestId);
        }

        let updated;
        try {
            updated = await updateReport(id, {
                htmlContent: cleanHtml,
                rawText,
                originalFilename: file.name,
                originalStoragePath: newStoragePath,
                fileSizeBytes: file.size,
            });
        } catch (dbError) {
            console.error(`[reports.file.PUT:${requestId}] db update failed, rolling back new storage`, dbError);
            await deleteReportFile(newStoragePath).catch(() => {});
            newStoragePath = null;
            return err('DB_ERROR', 'Database update failed', 500, requestId);
        }
        if (!updated) {
            await deleteReportFile(newStoragePath).catch(() => {});
            newStoragePath = null;
            return err('NOT_FOUND', 'Report disappeared during update', 404, requestId);
        }

        // DB committed — best-effort delete old file.
        const deleteOld = await deleteReportFile(oldStoragePath);
        if (!deleteOld.ok) {
            console.warn(`[reports.file.PUT:${requestId}] old storage delete failed, orphan: ${oldStoragePath} — ${deleteOld.error}`);
        }

        return NextResponse.json({ report: updated, requestId });
    } catch (error) {
        console.error(`[reports.file.PUT:${requestId}] unexpected`, error);
        if (newStoragePath) await deleteReportFile(newStoragePath).catch(() => {});
        return err('INTERNAL', 'Replace failed', 500, requestId);
    }
}
