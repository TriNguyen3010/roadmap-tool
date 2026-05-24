import type { ReportMetadata } from '@/types/report';

const DATE_RE = /Ngày:\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const WEEK_RE = /Week\s+(\d+)/i;
const RANGE_RE = /(\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2})/;
const SPRINT_RE = /SPRINT\s+(\d+)/i;

const pad = (n: number) => String(n).padStart(2, '0');

const todayIso = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const parseReportHeader = (rawText: string): ReportMetadata => {
    const head = (rawText || '').slice(0, 4000);

    const dateMatch = head.match(DATE_RE);
    const reportDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        : todayIso();
    const month = reportDate.slice(0, 7);

    const weekMatch = head.match(WEEK_RE);
    const weekLabel = weekMatch ? `Week ${weekMatch[1]}` : null;

    const rangeMatch = head.match(RANGE_RE);
    const dateRange = rangeMatch ? `${rangeMatch[1]} - ${rangeMatch[2]}` : null;

    const sprintMatch = head.match(SPRINT_RE);
    const sprintNumber = sprintMatch ? Number(sprintMatch[1]) : null;

    const title =
        weekLabel && dateRange
            ? `${weekLabel} · ${dateRange}`
            : weekLabel
                ? weekLabel
                : `Report ${reportDate}`;

    return { month, reportDate, sprintNumber, weekLabel, dateRange, title };
};
