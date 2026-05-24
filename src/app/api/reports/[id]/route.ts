import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportById, deleteReport } from '@/server/reportsRepo';
import { deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DELETE_RATE_MAX = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_MAX', 20);
const DELETE_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_WINDOW_MS', 60_000);

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);
    try {
        const report = await getReportById(id);
        if (!report) return err('NOT_FOUND', 'Report not found', 404, requestId);
        return NextResponse.json({ report, requestId });
    } catch (error) {
        console.error(`[reports.GET:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to fetch report', 500, requestId);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-delete',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: DELETE_RATE_MAX,
            windowMs: DELETE_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many delete requests', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const result = await deleteReport(id);
        if (!result) return err('NOT_FOUND', 'Report not found', 404, requestId);

        const storageResult = await deleteReportFile(result.storagePath);
        if (!storageResult.ok) {
            console.warn(`[reports.DELETE:${requestId}] storage delete failed, orphan: ${result.storagePath} — ${storageResult.error}`);
        }
        return NextResponse.json({ success: true, requestId });
    } catch (error) {
        console.error(`[reports.DELETE:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to delete', 500, requestId);
    }
}
