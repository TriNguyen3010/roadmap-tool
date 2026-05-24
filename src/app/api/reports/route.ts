import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { parseReportHeader } from '@/utils/parseReportHeader';
import { sanitizeReportHtml } from '@/utils/sanitizeReportHtml';
import { buildStoragePath } from '@/utils/reportFilename';
import { listReportsByMonth, insertReport } from '@/server/reportsRepo';
import { uploadReportFile, deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const MAX_MB = readPositiveIntEnv('REPORT_UPLOAD_MAX_MB', 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const UPLOAD_RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const UPLOAD_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const err = (
    code: ReportErrorCode,
    message: string,
    status: number,
    requestId: string,
    extra?: Record<string, unknown>,
) => NextResponse.json({ error: message, code, requestId, ...(extra ?? {}) }, { status });

export async function GET(request: NextRequest) {
    const requestId = randomUUID();
    try {
        const month = request.nextUrl.searchParams.get('month');
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return err('BAD_REQUEST', 'Query param `month` must be YYYY-MM', 400, requestId);
        }
        const reports = await listReportsByMonth(month);
        return NextResponse.json({ reports, requestId });
    } catch (error) {
        console.error(`[reports.GET:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to list reports', 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = randomUUID();
    let uploadedPath: string | null = null;
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-upload',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: UPLOAD_RATE_MAX,
            windowMs: UPLOAD_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many uploads', code: 'RATE_LIMITED', requestId },
                {
                    status: 429,
                    headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
                },
            );
        }

        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return err('NO_FILE', 'File is required', 400, requestId);

        if (file.type && file.type !== DOCX_MIME && !file.name.toLowerCase().endsWith('.docx')) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.size > MAX_BYTES) {
            return err('FILE_TOO_LARGE', `File exceeds ${MAX_MB}MB`, 400, requestId);
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

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
            console.error(`[reports.POST:${requestId}] mammoth failed`, parseError);
            return err('PARSE_FAILED', 'Could not parse .docx', 422, requestId);
        }

        const cleanHtml = sanitizeReportHtml(rawHtml);

        // Allow optional client overrides from the upload dialog
        const overrides = (() => {
            const raw = form.get('metadata');
            if (typeof raw !== 'string' || !raw) return null;
            try {
                return JSON.parse(raw) as Partial<{
                    month: string; reportDate: string; sprintNumber: number | null;
                    weekLabel: string | null; dateRange: string | null; title: string;
                }>;
            } catch { return null; }
        })();

        const parsed = parseReportHeader(rawText);
        const meta = { ...parsed, ...(overrides ?? {}) };

        const uuid = randomUUID();
        const storagePath = buildStoragePath(meta.month, uuid, file.name);

        const uploadResult = await uploadReportFile({ storagePath, buffer });
        if (!uploadResult.ok) {
            return err('STORAGE_ERROR', 'Storage upload failed', 500, requestId, { details: uploadResult.error });
        }
        uploadedPath = storagePath;

        try {
            const row = await insertReport({
                month: meta.month,
                reportDate: meta.reportDate,
                sprintNumber: meta.sprintNumber,
                title: meta.title,
                weekLabel: meta.weekLabel,
                dateRange: meta.dateRange,
                originalFilename: file.name,
                originalStoragePath: storagePath,
                htmlContent: cleanHtml,
                rawText,
                uploadedBy: auth.sessionUser.label || auth.sessionUser.email,
                fileSizeBytes: file.size,
            });
            return NextResponse.json({ report: row, requestId });
        } catch (dbError) {
            console.error(`[reports.POST:${requestId}] db insert failed, rolling back storage`, dbError);
            await deleteReportFile(storagePath).catch(() => {});
            uploadedPath = null;
            return err('DB_ERROR', 'Database insert failed', 500, requestId);
        }
    } catch (error) {
        console.error(`[reports.POST:${requestId}] unexpected`, error);
        if (uploadedPath) await deleteReportFile(uploadedPath).catch(() => {});
        return err('INTERNAL', 'Upload failed', 500, requestId);
    }
}
