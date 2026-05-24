// Wire types for the report library API. Keep narrow and serializable.

export type ReportMetadata = {
    month: string;          // 'YYYY-MM'
    reportDate: string;     // 'YYYY-MM-DD'
    sprintNumber: number | null;
    weekLabel: string | null;
    dateRange: string | null;
    title: string;
};

export type Report = ReportMetadata & {
    id: string;
    originalFilename: string;
    fileSizeBytes: number;
    uploadedBy: string | null;
    createdAt: string;
    updatedAt: string;
    htmlContent: string;
};

// List items omit html_content to keep payloads small.
export type ReportListItem = Omit<Report, 'htmlContent'>;

export type ReportErrorCode =
    | 'UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'NO_FILE'
    | 'INVALID_FILE_TYPE'
    | 'FILE_TOO_LARGE'
    | 'PARSE_FAILED'
    | 'STORAGE_ERROR'
    | 'DB_ERROR'
    | 'NOT_FOUND'
    | 'BAD_REQUEST'
    | 'INTERNAL';

export type ReportErrorBody = {
    error: string;
    code: ReportErrorCode;
    requestId: string;
};
