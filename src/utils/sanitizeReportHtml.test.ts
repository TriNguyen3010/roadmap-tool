import { describe, expect, it } from 'vitest';
import { sanitizeReportHtml } from './sanitizeReportHtml';

describe('sanitizeReportHtml', () => {
    it('keeps allowed structural tags', () => {
        const html = '<h1>T</h1><p><strong>x</strong> <em>y</em></p><ul><li>a</li></ul>';
        expect(sanitizeReportHtml(html)).toContain('<h1>T</h1>');
        expect(sanitizeReportHtml(html)).toContain('<strong>x</strong>');
        expect(sanitizeReportHtml(html)).toContain('<li>a</li>');
    });

    it('strips <script> tags', () => {
        const html = '<p>hi</p><script>alert(1)</script>';
        const out = sanitizeReportHtml(html);
        expect(out).toContain('<p>hi</p>');
        expect(out).not.toContain('<script');
        expect(out).not.toContain('alert');
    });

    it('strips inline event handlers', () => {
        const html = '<img src="x" onerror="alert(1)" alt="t">';
        expect(sanitizeReportHtml(html)).not.toContain('onerror');
    });

    it('keeps href on anchors', () => {
        const html = '<a href="https://example.com">link</a>';
        expect(sanitizeReportHtml(html)).toContain('href="https://example.com"');
    });

    it('keeps table structure', () => {
        const html = '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table>';
        const out = sanitizeReportHtml(html);
        expect(out).toContain('<table');
        expect(out).toContain('<th>h</th>');
        expect(out).toContain('<td>v</td>');
    });

    it('falls back to placeholder for empty/whitespace input', () => {
        expect(sanitizeReportHtml('')).toContain('Không parse được');
        expect(sanitizeReportHtml('   ')).toContain('Không parse được');
    });
});
