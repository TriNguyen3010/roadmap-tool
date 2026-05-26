import { describe, expect, it } from 'vitest';
import { buildPatchPayload } from './buildPatchPayload';
import type { Report, MetaDraft } from '@/types/report';

const REPORT: Report = {
    id: 'r1',
    month: '2026-05',
    reportDate: '2026-05-19',
    sprintNumber: 77,
    title: 'Week 21',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    originalFilename: 's.docx',
    fileSizeBytes: 1234,
    uploadedBy: 'tri',
    createdAt: 'x',
    updatedAt: 'y',
    htmlContent: '<p>old</p>',
};

const draftFromReport = (): MetaDraft => ({
    title: REPORT.title,
    weekLabel: REPORT.weekLabel ?? '',
    dateRange: REPORT.dateRange ?? '',
    sprintNumber: REPORT.sprintNumber,
    reportDate: REPORT.reportDate,
});

describe('buildPatchPayload', () => {
    it('returns empty object when nothing changed', () => {
        const result = buildPatchPayload(REPORT, draftFromReport(), REPORT.htmlContent);
        expect(result).toEqual({});
    });

    it('includes only changed metadata fields', () => {
        const draft = draftFromReport();
        draft.title = 'Week 22';
        draft.sprintNumber = 78;
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result).toEqual({ title: 'Week 22', sprintNumber: 78 });
    });

    it('converts empty string weekLabel/dateRange to null', () => {
        const draft = draftFromReport();
        draft.weekLabel = '';
        draft.dateRange = '';
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result.weekLabel).toBeNull();
        expect(result.dateRange).toBeNull();
    });

    it('includes htmlContent only when it differs', () => {
        const draft = draftFromReport();
        const result = buildPatchPayload(REPORT, draft, '<p>new</p>');
        expect(result).toEqual({ htmlContent: '<p>new</p>' });
    });

    it('updates reportDate and derives month', () => {
        const draft = draftFromReport();
        draft.reportDate = '2026-06-02';
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result.reportDate).toBe('2026-06-02');
        expect(result.month).toBe('2026-06');
    });
});
