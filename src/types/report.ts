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

// UI-side draft of editable metadata fields. Empty string means "unset" for nullable fields.
export type MetaDraft = {
    title: string;
    weekLabel: string;
    dateRange: string;
    sprintNumber: number | null;
    reportDate: string; // 'YYYY-MM-DD'
};

// Server-side patch input. All fields optional; only present keys are written.
export type UpdateReportInput = Partial<{
    title: string;
    weekLabel: string | null;
    dateRange: string | null;
    sprintNumber: number | null;
    reportDate: string;
    month: string;
    htmlContent: string;
    rawText: string;
    originalFilename: string;
    originalStoragePath: string;
    fileSizeBytes: number;
}>;
