import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportById, deleteReport, updateReport } from '@/server/reportsRepo';
import { deleteReportFile } from '@/lib/reportsStorage';
import { sanitizeReportHtml } from '@/utils/sanitizeReportHtml';
import type { ReportErrorCode, UpdateReportInput } from '@/types/report';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DELETE_RATE_MAX = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_MAX', 20);
const DELETE_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_WINDOW_MS', 60_000);

const PATCH_RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const PATCH_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-patch',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: PATCH_RATE_MAX,
            windowMs: PATCH_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many edits', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return err('BAD_REQUEST', 'Invalid JSON', 400, requestId); }

        const partial: UpdateReportInput = {};

        if ('title' in body) {
            if (typeof body.title !== 'string' || !body.title.trim()) {
                return err('BAD_REQUEST', '`title` must be a non-empty string', 400, requestId);
            }
            partial.title = body.title.trim();
        }
        if ('weekLabel' in body) {
            if (body.weekLabel !== null && typeof body.weekLabel !== 'string') {
                return err('BAD_REQUEST', '`weekLabel` must be string or null', 400, requestId);
            }
            // Whitespace-only becomes null to match client-side buildPatchPayload behavior.
            const trimmed = typeof body.weekLabel === 'string' ? body.weekLabel.trim() : null;
            partial.weekLabel = trimmed ? trimmed : null;
        }
        if ('dateRange' in body) {
            if (body.dateRange !== null && typeof body.dateRange !== 'string') {
                return err('BAD_REQUEST', '`dateRange` must be string or null', 400, requestId);
            }
            const trimmed = typeof body.dateRange === 'string' ? body.dateRange.trim() : null;
            partial.dateRange = trimmed ? trimmed : null;
        }
        if ('sprintNumber' in body) {
            if (body.sprintNumber !== null && (typeof body.sprintNumber !== 'number' || !Number.isInteger(body.sprintNumber) || body.sprintNumber < 0)) {
                return err('BAD_REQUEST', '`sprintNumber` must be non-negative integer or null', 400, requestId);
            }
            partial.sprintNumber = body.sprintNumber as number | null;
        }
        if ('month' in body) {
            if (typeof body.month !== 'string' || !MONTH_RE.test(body.month)) {
                return err('BAD_REQUEST', '`month` must be YYYY-MM', 400, requestId);
            }
            partial.month = body.month;
        }
        if ('reportDate' in body) {
            if (typeof body.reportDate !== 'string' || !ISO_DATE_RE.test(body.reportDate)) {
                return err('BAD_REQUEST', '`reportDate` must be YYYY-MM-DD', 400, requestId);
            }
            partial.reportDate = body.reportDate;
            // Auto-derive month if reportDate present and month not explicitly given
            if (!('month' in body)) partial.month = body.reportDate.slice(0, 7);
        }
        if ('htmlContent' in body) {
            if (typeof body.htmlContent !== 'string') {
                return err('BAD_REQUEST', '`htmlContent` must be a string', 400, requestId);
            }
            const sanitized = sanitizeReportHtml(body.htmlContent);
            // If user submitted non-empty content but sanitizer rejected everything, signal.
            if (body.htmlContent.trim() && sanitized.includes('Không parse được nội dung')) {
                return err('PARSE_FAILED', 'Sanitized content is empty', 422, requestId);
            }
            partial.htmlContent = sanitized;
        }

        const updated = await updateReport(id, partial);
        if (!updated) return err('NOT_FOUND', 'Report not found', 404, requestId);
        return NextResponse.json({ report: updated, requestId });
    } catch (error) {
        console.error(`[reports.PATCH:${requestId}] failed`, error);
        return err('INTERNAL', 'Update failed', 500, requestId);
    }
}
