// Sanitizer for HTML produced by mammoth from uploaded .docx files.
// This is the single trust boundary between untrusted document content and
// the browser: the sanitized output is persisted to Postgres and later
// rendered via dangerouslySetInnerHTML. Defense relies on the ALLOWED_TAGS
// + ALLOWED_ATTR positive allow-list; the SVG data-URI hook below closes a
// known XSS bypass that the allow-list alone does not stop.
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

// Block data: URIs that aren't raster images. Mammoth emits raster data
// URIs for embedded images (png/jpeg/gif/webp/avif); SVG must be blocked
// because it can carry inline <script> and event handlers.
const SAFE_RASTER_DATA_RE = /^data:image\/(png|jpe?g|gif|webp|avif);/i;

let hookRegistered = false;
const ensureHook = () => {
    if (hookRegistered) return;
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        const getAttr = (node as Element).getAttribute?.bind(node);
        const removeAttr = (node as Element).removeAttribute?.bind(node);
        if (!getAttr || !removeAttr) return;
        const src = getAttr('src') ?? '';
        if (src && /^data:/i.test(src) && !SAFE_RASTER_DATA_RE.test(src)) {
            removeAttr('src');
        }
        const href = getAttr('href') ?? '';
        if (href && /^\s*(?:javascript|data):/i.test(href)) {
            removeAttr('href');
        }
    });
    hookRegistered = true;
};

export const sanitizeReportHtml = (html: string): string => {
    ensureHook();
    const trimmed = (html || '').trim();
    if (!trimmed) return FALLBACK;
    const clean = DOMPurify.sanitize(trimmed, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
    });
    return clean.trim() ? clean : FALLBACK;
};
