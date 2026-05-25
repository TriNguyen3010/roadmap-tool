import type { Report, MetaDraft, UpdateReportInput } from '@/types/report';

const orNull = (s: string): string | null => (s.trim() ? s : null);

export const buildPatchPayload = (
    original: Report,
    draft: MetaDraft,
    draftHtml: string,
): UpdateReportInput => {
    const patch: UpdateReportInput = {};

    if (draft.title !== original.title) patch.title = draft.title;

    const nextWeekLabel = orNull(draft.weekLabel);
    if (nextWeekLabel !== (original.weekLabel ?? null)) patch.weekLabel = nextWeekLabel;

    const nextDateRange = orNull(draft.dateRange);
    if (nextDateRange !== (original.dateRange ?? null)) patch.dateRange = nextDateRange;

    if (draft.sprintNumber !== original.sprintNumber) patch.sprintNumber = draft.sprintNumber;

    if (draft.reportDate !== original.reportDate) {
        patch.reportDate = draft.reportDate;
        patch.month = draft.reportDate.slice(0, 7);
    }

    if (draftHtml !== original.htmlContent) patch.htmlContent = draftHtml;

    return patch;
};
