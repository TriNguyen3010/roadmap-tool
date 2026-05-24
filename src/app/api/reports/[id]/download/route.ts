import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportStoragePath } from '@/server/reportsRepo';
import { createReportSignedUrl } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const RATE_MAX = readPositiveIntEnv('REPORT_DOWNLOAD_RATE_LIMIT_MAX', 60);
const RATE_WINDOW_MS = readPositiveIntEnv('REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);
    try {
        const rate = checkRateLimit({
            scope: 'reports-download',
            key: getRateLimitKey(request),
            limit: RATE_MAX,
            windowMs: RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many downloads', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const storagePath = await getReportStoragePath(id);
        if (!storagePath) return err('NOT_FOUND', 'Report not found', 404, requestId);

        const signed = await createReportSignedUrl(storagePath);
        if ('error' in signed) {
            return err('STORAGE_ERROR', 'Could not create download URL', 500, requestId);
        }
        return NextResponse.json({ url: signed.url, requestId });
    } catch (error) {
        console.error(`[reports.download:${requestId}] failed`, error);
        return err('INTERNAL', 'Download failed', 500, requestId);
    }
}
