import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'u', 's',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'br', 'hr',
    'a', 'img',
    'span', 'div',
    'blockquote', 'code', 'pre',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'];

const FALLBACK = '<p><em>Không parse được nội dung — tải file gốc để xem.</em></p>';

export const sanitizeReportHtml = (html: string): string => {
    const trimmed = (html || '').trim();
    if (!trimmed) return FALLBACK;
    const clean = DOMPurify.sanitize(trimmed, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        FORBID_ATTR: ['style', 'on*'],
    });
    return clean.trim() ? clean : FALLBACK;
};
