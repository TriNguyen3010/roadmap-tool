import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { listMonths } from '@/server/reportsRepo';

export const runtime = 'nodejs';

const todayMonth = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export async function GET() {
    const requestId = randomUUID();
    try {
        const months = await listMonths();
        const result = months.length > 0 ? months : [todayMonth()];
        return NextResponse.json({ months: result, requestId });
    } catch (error) {
        console.error(`[reports/months:${requestId}] failed`, error);
        return NextResponse.json(
            { error: 'Failed to list months', code: 'INTERNAL', requestId },
            { status: 500 }
        );
    }
}
