const MAX_NAME_LEN = 120;

export const sanitizeReportFilename = (raw: string): string => {
    let name = (raw || '').trim();
    // Replace path separators
    name = name.replace(/[\\/]+/g, '_');
    // Remove ".." sequences
    name = name.replace(/\.{2,}/g, '_');
    // Strip control chars (keep printable Unicode incl. diacritics)
    name = name.replace(/[\x00-\x1F\x7F]/g, '');
    // Collapse repeated underscores and strip leading/trailing underscores
    name = name.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    // Collapse whitespace
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) name = 'report';
    // Strip trailing whitespace before the extension
    name = name.replace(/\s+(\.docx)$/i, '$1');
    // Enforce .docx
    if (!/\.docx$/i.test(name)) name = `${name}.docx`;
    // If the stem (everything before .docx) is empty / whitespace / underscores only,
    // the filename is hidden-file-style and useless. Fall back.
    const stemMatch = name.match(/^(.*)\.docx$/i);
    if (stemMatch && !stemMatch[1].replace(/[_\s]/g, '').length) name = 'report.docx';
    // Truncate (keep .docx extension)
    if (name.length > MAX_NAME_LEN) {
        name = `${name.slice(0, MAX_NAME_LEN - 5)}.docx`;
    }
    return name;
};

export const buildStoragePath = (month: string, uuid: string, originalFilename: string): string => {
    const safe = sanitizeReportFilename(originalFilename);
    return `${month}/${uuid}-${safe}`;
};
