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

    it('strips data:image/svg+xml in img src (XSS vector)', () => {
        const html = '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+" alt="x">';
        const out = sanitizeReportHtml(html);
        expect(out).not.toContain('data:image/svg+xml');
    });

    it('preserves data:image/png in img src (legitimate Mammoth output)', () => {
        const html = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok">';
        const out = sanitizeReportHtml(html);
        expect(out).toContain('data:image/png');
    });

    it('strips javascript: href on anchors', () => {
        const html = '<a href="javascript:alert(1)">click</a>';
        const out = sanitizeReportHtml(html);
        expect(out).not.toContain('javascript:');
    });

    it('strips data-* attributes', () => {
        const html = '<p data-evil="payload">x</p>';
        const out = sanitizeReportHtml(html);
        expect(out).not.toContain('data-evil');
    });
});
