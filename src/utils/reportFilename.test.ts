import { describe, expect, it } from 'vitest';
import { sanitizeReportFilename, buildStoragePath } from './reportFilename';

describe('sanitizeReportFilename', () => {
    it('replaces path separators and dotdot', () => {
        expect(sanitizeReportFilename('../../etc/passwd.docx')).toBe('etc_passwd.docx');
        expect(sanitizeReportFilename('foo/bar.docx')).toBe('foo_bar.docx');
        expect(sanitizeReportFilename('foo\\bar.docx')).toBe('foo_bar.docx');
    });

    it('strips control chars but preserves Vietnamese diacritics', () => {
        const out = sanitizeReportFilename('Báo cáo tuần 21 .docx');
        expect(out).toBe('Báo cáo tuần 21.docx');
    });

    it('preserves spaces and collapses repeats', () => {
        expect(sanitizeReportFilename('a   b.docx')).toBe('a b.docx');
    });

    it('forces .docx extension when missing', () => {
        expect(sanitizeReportFilename('plain')).toBe('plain.docx');
    });

    it('truncates very long names', () => {
        const long = 'x'.repeat(300) + '.docx';
        const out = sanitizeReportFilename(long);
        expect(out.length).toBeLessThanOrEqual(120);
        expect(out.endsWith('.docx')).toBe(true);
    });
});

describe('buildStoragePath', () => {
    it('builds <month>/<uuid>-<safe>.docx', () => {
        const path = buildStoragePath('2026-05', 'aaaa-bbbb', 'Week 21.docx');
        expect(path).toBe('2026-05/aaaa-bbbb-Week 21.docx');
    });
});
