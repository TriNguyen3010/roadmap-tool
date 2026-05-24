import { describe, expect, it } from 'vitest';
import { parseReportHeader } from './parseReportHeader';

const WEEK21_SAMPLE = `BÁO CÁO TEAM WALLET
Ngày: 19/05/2026
1. TỔNG QUAN
Có thể submit...
2. SPRINT 77 (16.12.2)
Chặn user IP Việt Nam
SW _ Week 21 Report _ 18/05 - 22/05`;

describe('parseReportHeader', () => {
    it('extracts metadata from a full Week 21 sample', () => {
        const meta = parseReportHeader(WEEK21_SAMPLE);
        expect(meta.weekLabel).toBe('Week 21');
        expect(meta.dateRange).toBe('18/05 - 22/05');
        expect(meta.sprintNumber).toBe(77);
        expect(meta.reportDate).toBe('2026-05-19');
        expect(meta.month).toBe('2026-05');
    });

    it('falls back when sprint is missing', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026\nWeek 21 Report');
        expect(meta.sprintNumber).toBeNull();
        expect(meta.weekLabel).toBe('Week 21');
    });

    it('falls back when week label is missing', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026\nSPRINT 77');
        expect(meta.weekLabel).toBeNull();
        expect(meta.sprintNumber).toBe(77);
    });

    it('falls back to today when report date is missing', () => {
        const meta = parseReportHeader('Random text without date');
        expect(meta.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(meta.month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('builds a sensible title from week + date range', () => {
        const meta = parseReportHeader(WEEK21_SAMPLE);
        expect(meta.title).toBe('Week 21 · 18/05 - 22/05');
    });

    it('builds title from week alone when date range is missing', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026\nWeek 21 Report');
        expect(meta.title).toBe('Week 21');
    });

    it('falls back title to "Report YYYY-MM-DD" when no week/range', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026');
        expect(meta.title).toBe('Report 2026-05-19');
    });
});
