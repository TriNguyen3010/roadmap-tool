// Sanitizer for HTML produced by mammoth / report editor content.
// This is the single trust boundary before content is persisted and later
// rendered via dangerouslySetInnerHTML. Keep this implementation server-safe:
// Vercel Lambda has been unreliable with jsdom-backed sanitizers.
import sanitizeHtml from 'sanitize-html';

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

const FALLBACK = '<p><em>Không parse được nội dung — tải file gốc để xem.</em></p>';

// Block data: URIs that aren't raster images. Mammoth emits raster data
// URIs for embedded images (png/jpeg/gif/webp/avif); SVG must be blocked
// because it can carry inline <script> and event handlers.
const SAFE_RASTER_DATA_RE = /^data:image\/(png|jpe?g|gif|webp|avif);/i;

export const sanitizeReportHtml = (html: string): string => {
    const trimmed = (html || '').trim();
    if (!trimmed) return FALLBACK;
    const clean = sanitizeHtml(trimmed, {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: {
            '*': ['title'],
            a: ['href', 'title'],
            img: ['src', 'alt', 'title'],
            td: ['colspan', 'rowspan', 'title'],
            th: ['colspan', 'rowspan', 'title'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data'],
        },
        allowProtocolRelative: false,
        transformTags: {
            a: (_tagName, attribs) => {
                const href = attribs.href ?? '';
                if (/^\s*(?:javascript|data):/i.test(href)) {
                    const { href: _href, ...rest } = attribs;
                    void _href;
                    return { tagName: 'a', attribs: rest };
                }
                return { tagName: 'a', attribs };
            },
            img: (_tagName, attribs) => {
                const src = attribs.src ?? '';
                if (/^data:/i.test(src) && !SAFE_RASTER_DATA_RE.test(src)) {
                    const { src: _src, ...rest } = attribs;
                    void _src;
                    return { tagName: 'img', attribs: rest };
                }
                return { tagName: 'img', attribs };
            },
        },
    });
    return clean.trim() ? clean : FALLBACK;
};
