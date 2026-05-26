# Weekly Report Edit & Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline edit + save to the existing weekly-report popup: editors can change metadata (title, week, sprint, dates), edit HTML content via TipTap rich editor, and replace the original `.docx` file, all from within the same popup.

**Architecture:** Two new API endpoints (`PATCH /api/reports/[id]` for metadata + html, `PUT /api/reports/[id]/file` for file replace) backed by a single new repo function `updateReport`. UI adds a `mode: 'view' | 'edit'` state to `<ReportPopup>` and two new components (`<ReportEditMetaForm>`, `<ReportEditBody>`). Server-side `sanitizeReportHtml` runs on every save (reusing the T5 trust boundary).

**Tech Stack:** Next.js 16 App Router (Node runtime), React 19, TypeScript, Supabase (Postgres + Storage), `mammoth`, `isomorphic-dompurify`, `@tiptap/react` + `@tiptap/starter-kit` + Table/Link/Image/Underline extensions, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-25-weekly-report-edit-save-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/utils/buildPatchPayload.ts` (+ `.test.ts`) | Pure diff helper — compares a `Report` to a `MetaDraft + htmlDraft` and produces the minimal PATCH body |
| `src/components/ReportEditMetaForm.tsx` (+ `.test.tsx`) | Controlled form for title, weekLabel, dateRange, sprintNumber, reportDate; validation surfacing |
| `src/components/ReportEditBody.tsx` (+ `.test.tsx`) | TipTap mount + toolbar + HTML-source toggle |
| `src/app/api/reports/[id]/file/route.ts` | PUT handler: replace `.docx`, re-parse, atomic storage swap |

### Modified files

| Path | Change |
|---|---|
| `package.json` | Add TipTap deps |
| `src/types/report.ts` | Add `MetaDraft`, `UpdateReportInput` types |
| `src/server/reportsRepo.ts` | Add `updateReport(id, partial)` function |
| `src/app/api/reports/[id]/route.ts` | Add `PATCH` handler |
| `src/components/ReportPopup.tsx` | Add `mode` state, edit-mode JSX, save/cancel/replace flows, `canEdit` prop |
| `src/app/roadmap/[id]/page.tsx` | Pass `canEdit={canManageRoadmap}` to `<ReportPopup>` |
| `src/components/ReportPopup.test.tsx` | Add tests for edit-mode wiring |

---

## Task 1: Install TipTap dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install @tiptap/react@^2 @tiptap/starter-kit@^2 @tiptap/extension-table@^2 @tiptap/extension-table-row@^2 @tiptap/extension-table-cell@^2 @tiptap/extension-table-header@^2 @tiptap/extension-link@^2 @tiptap/extension-image@^2 @tiptap/extension-underline@^2
```

Expected: 9 packages added under `dependencies`.

- [ ] **Step 2: Verify install + types**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If TypeScript complains, the TipTap packages ship `.d.ts` files; no extra `@types/*` needed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add TipTap rich-text editor for report editing"
```

---

## Task 2: Add input types

**Files:**
- Modify: `src/types/report.ts`

- [ ] **Step 1: Add `MetaDraft` and `UpdateReportInput` types**

Append to `src/types/report.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/report.ts
git commit -m "feat(types): add MetaDraft + UpdateReportInput for edit flow"
```

---

## Task 3: `reportsRepo.updateReport`

**Files:**
- Modify: `src/server/reportsRepo.ts`

- [ ] **Step 1: Add the function**

In `src/server/reportsRepo.ts`, just below `insertReport` and above `deleteReport`, add:

```ts
import type { UpdateReportInput } from '@/types/report';

const camelToDbRow = (input: UpdateReportInput): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if ('title' in input)               row.title = input.title;
    if ('weekLabel' in input)           row.week_label = input.weekLabel;
    if ('dateRange' in input)           row.date_range = input.dateRange;
    if ('sprintNumber' in input)        row.sprint_number = input.sprintNumber;
    if ('reportDate' in input)          row.report_date = input.reportDate;
    if ('month' in input)               row.month = input.month;
    if ('htmlContent' in input)         row.html_content = input.htmlContent;
    if ('rawText' in input)             row.raw_text = input.rawText;
    if ('originalFilename' in input)    row.original_filename = input.originalFilename;
    if ('originalStoragePath' in input) row.original_storage_path = input.originalStoragePath;
    if ('fileSizeBytes' in input)       row.file_size_bytes = input.fileSizeBytes;
    return row;
};

export const updateReport = async (id: string, input: UpdateReportInput): Promise<Report | null> => {
    const row = camelToDbRow(input);
    if (Object.keys(row).length === 0) {
        // No fields to update — return current row so callers always get a fresh Report.
        return getReportById(id);
    }
    const { data, error } = await supabase
        .from('reports')
        .update(row)
        .eq('id', id)
        .select(FULL_COLUMNS)
        .maybeSingle();
    if (error) throw new Error(`updateReport: ${error.message}`);
    return data ? toReport(data as DbRow) : null;
};
```

Make sure the `import type { UpdateReportInput }` line appears at the top with the other imports (not inline).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/reportsRepo.ts
git commit -m "feat(server): reportsRepo.updateReport for partial edits"
```

---

## Task 4: `PATCH /api/reports/[id]` handler

**Files:**
- Modify: `src/app/api/reports/[id]/route.ts`

- [ ] **Step 1: Add the PATCH handler**

Open `src/app/api/reports/[id]/route.ts`. Add these imports at the top (near the existing imports):

```ts
import { sanitizeReportHtml } from '@/utils/sanitizeReportHtml';
import { updateReport } from '@/server/reportsRepo';
import type { UpdateReportInput } from '@/types/report';
```

Add these rate-limit constants near the existing `DELETE_RATE_*` constants:

```ts
const PATCH_RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const PATCH_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);
```

Add the regexes at module scope (alongside `UUID_RE`):

```ts
const MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
```

Add the handler at the bottom of the file (after `DELETE`):

```ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-patch',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: PATCH_RATE_MAX,
            windowMs: PATCH_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many edits', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return err('BAD_REQUEST', 'Invalid JSON', 400, requestId); }

        const partial: UpdateReportInput = {};

        if ('title' in body) {
            if (typeof body.title !== 'string' || !body.title.trim()) {
                return err('BAD_REQUEST', '`title` must be a non-empty string', 400, requestId);
            }
            partial.title = body.title.trim();
        }
        if ('weekLabel' in body) {
            if (body.weekLabel !== null && typeof body.weekLabel !== 'string') {
                return err('BAD_REQUEST', '`weekLabel` must be string or null', 400, requestId);
            }
            partial.weekLabel = body.weekLabel as string | null;
        }
        if ('dateRange' in body) {
            if (body.dateRange !== null && typeof body.dateRange !== 'string') {
                return err('BAD_REQUEST', '`dateRange` must be string or null', 400, requestId);
            }
            partial.dateRange = body.dateRange as string | null;
        }
        if ('sprintNumber' in body) {
            if (body.sprintNumber !== null && (typeof body.sprintNumber !== 'number' || !Number.isFinite(body.sprintNumber) || body.sprintNumber < 0)) {
                return err('BAD_REQUEST', '`sprintNumber` must be non-negative number or null', 400, requestId);
            }
            partial.sprintNumber = body.sprintNumber as number | null;
        }
        if ('month' in body) {
            if (typeof body.month !== 'string' || !MONTH_RE.test(body.month)) {
                return err('BAD_REQUEST', '`month` must be YYYY-MM', 400, requestId);
            }
            partial.month = body.month;
        }
        if ('reportDate' in body) {
            if (typeof body.reportDate !== 'string' || !ISO_DATE_RE.test(body.reportDate)) {
                return err('BAD_REQUEST', '`reportDate` must be YYYY-MM-DD', 400, requestId);
            }
            partial.reportDate = body.reportDate;
            // Auto-derive month if reportDate present and month not explicitly given
            if (!('month' in body)) partial.month = body.reportDate.slice(0, 7);
        }
        if ('htmlContent' in body) {
            if (typeof body.htmlContent !== 'string') {
                return err('BAD_REQUEST', '`htmlContent` must be a string', 400, requestId);
            }
            const sanitized = sanitizeReportHtml(body.htmlContent);
            // If user submitted non-empty content but sanitizer rejected everything, signal.
            if (body.htmlContent.trim() && sanitized.includes('Không parse được nội dung')) {
                return err('PARSE_FAILED', 'Sanitized content is empty', 422, requestId);
            }
            partial.htmlContent = sanitized;
        }

        const updated = await updateReport(id, partial);
        if (!updated) return err('NOT_FOUND', 'Report not found', 404, requestId);
        return NextResponse.json({ report: updated, requestId });
    } catch (error) {
        console.error(`[reports.PATCH:${requestId}] failed`, error);
        return err('INTERNAL', 'Update failed', 500, requestId);
    }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/\[id\]/route.ts
git commit -m "feat(api): PATCH /api/reports/[id] for metadata + content edits"
```

---

## Task 5: `PUT /api/reports/[id]/file` handler

**Files:**
- Create: `src/app/api/reports/[id]/file/route.ts`

- [ ] **Step 1: Create the file**

Create `src/app/api/reports/[id]/file/route.ts` with this exact content:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { sanitizeReportHtml } from '@/utils/sanitizeReportHtml';
import { buildStoragePath } from '@/utils/reportFilename';
import { getReportById, getReportStoragePath, updateReport } from '@/server/reportsRepo';
import { uploadReportFile, deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const MAX_MB = readPositiveIntEnv('REPORT_UPLOAD_MAX_MB', 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    if (!UUID_RE.test(id)) return err('NOT_FOUND', 'Report not found', 404, requestId);

    let newStoragePath: string | null = null;
    let oldStoragePath: string | null = null;

    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-replace-file',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: RATE_MAX,
            windowMs: RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many file replaces', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const existing = await getReportById(id);
        if (!existing) return err('NOT_FOUND', 'Report not found', 404, requestId);
        // Fetch storage path separately because Report wire type intentionally omits it.
        oldStoragePath = await getReportStoragePath(id);
        if (!oldStoragePath) return err('NOT_FOUND', 'Report storage path missing', 404, requestId);

        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return err('NO_FILE', 'File is required', 400, requestId);
        if (!file.name.toLowerCase().endsWith('.docx')) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.type && file.type !== DOCX_MIME) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.size > MAX_BYTES) {
            return err('FILE_TOO_LARGE', `File exceeds ${MAX_MB}MB`, 400, requestId);
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        let rawHtml = '';
        let rawText = '';
        try {
            const [htmlOut, textOut] = await Promise.all([
                mammoth.convertToHtml({ buffer }),
                mammoth.extractRawText({ buffer }),
            ]);
            rawHtml = htmlOut.value;
            rawText = textOut.value;
        } catch (parseError) {
            console.error(`[reports.file.PUT:${requestId}] mammoth failed`, parseError);
            return err('PARSE_FAILED', 'Could not parse .docx', 422, requestId);
        }

        const cleanHtml = sanitizeReportHtml(rawHtml);
        const newUuid = randomUUID();
        newStoragePath = buildStoragePath(existing.month, newUuid, file.name);

        const uploadResult = await uploadReportFile({ storagePath: newStoragePath, buffer });
        if (!uploadResult.ok) {
            return err('STORAGE_ERROR', 'Storage upload failed', 500, requestId);
        }

        let updated;
        try {
            updated = await updateReport(id, {
                htmlContent: cleanHtml,
                rawText,
                originalFilename: file.name,
                originalStoragePath: newStoragePath,
                fileSizeBytes: file.size,
            });
        } catch (dbError) {
            console.error(`[reports.file.PUT:${requestId}] db update failed, rolling back new storage`, dbError);
            await deleteReportFile(newStoragePath).catch(() => {});
            newStoragePath = null;
            return err('DB_ERROR', 'Database update failed', 500, requestId);
        }
        if (!updated) {
            await deleteReportFile(newStoragePath).catch(() => {});
            newStoragePath = null;
            return err('NOT_FOUND', 'Report disappeared during update', 404, requestId);
        }

        // DB committed — best-effort delete old file.
        const deleteOld = await deleteReportFile(oldStoragePath);
        if (!deleteOld.ok) {
            console.warn(`[reports.file.PUT:${requestId}] old storage delete failed, orphan: ${oldStoragePath} — ${deleteOld.error}`);
        }

        return NextResponse.json({ report: updated, requestId });
    } catch (error) {
        console.error(`[reports.file.PUT:${requestId}] unexpected`, error);
        if (newStoragePath) await deleteReportFile(newStoragePath).catch(() => {});
        return err('INTERNAL', 'Replace failed', 500, requestId);
    }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/reports/[id]/file/route.ts"
git commit -m "feat(api): PUT /api/reports/[id]/file for replacing .docx"
```

---

## Task 6: `buildPatchPayload` util (TDD)

**Files:**
- Create: `src/utils/buildPatchPayload.test.ts`
- Create: `src/utils/buildPatchPayload.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/buildPatchPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPatchPayload } from './buildPatchPayload';
import type { Report, MetaDraft } from '@/types/report';

const REPORT: Report = {
    id: 'r1',
    month: '2026-05',
    reportDate: '2026-05-19',
    sprintNumber: 77,
    title: 'Week 21',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    originalFilename: 's.docx',
    fileSizeBytes: 1234,
    uploadedBy: 'tri',
    createdAt: 'x',
    updatedAt: 'y',
    htmlContent: '<p>old</p>',
};

const draftFromReport = (): MetaDraft => ({
    title: REPORT.title,
    weekLabel: REPORT.weekLabel ?? '',
    dateRange: REPORT.dateRange ?? '',
    sprintNumber: REPORT.sprintNumber,
    reportDate: REPORT.reportDate,
});

describe('buildPatchPayload', () => {
    it('returns empty object when nothing changed', () => {
        const result = buildPatchPayload(REPORT, draftFromReport(), REPORT.htmlContent);
        expect(result).toEqual({});
    });

    it('includes only changed metadata fields', () => {
        const draft = draftFromReport();
        draft.title = 'Week 22';
        draft.sprintNumber = 78;
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result).toEqual({ title: 'Week 22', sprintNumber: 78 });
    });

    it('converts empty string weekLabel/dateRange to null', () => {
        const draft = draftFromReport();
        draft.weekLabel = '';
        draft.dateRange = '';
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result.weekLabel).toBeNull();
        expect(result.dateRange).toBeNull();
    });

    it('includes htmlContent only when it differs', () => {
        const draft = draftFromReport();
        const result = buildPatchPayload(REPORT, draft, '<p>new</p>');
        expect(result).toEqual({ htmlContent: '<p>new</p>' });
    });

    it('updates reportDate and derives month', () => {
        const draft = draftFromReport();
        draft.reportDate = '2026-06-02';
        const result = buildPatchPayload(REPORT, draft, REPORT.htmlContent);
        expect(result.reportDate).toBe('2026-06-02');
        expect(result.month).toBe('2026-06');
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/utils/buildPatchPayload.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/buildPatchPayload.ts`:

```ts
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
```

- [ ] **Step 4: Run test, verify all pass**

```bash
npx vitest run src/utils/buildPatchPayload.test.ts
```

Expected: 5/5 green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/buildPatchPayload.ts src/utils/buildPatchPayload.test.ts
git commit -m "feat(utils): buildPatchPayload diff helper for report edit"
```

---

## Task 7: `<ReportEditMetaForm>` component (TDD)

**Files:**
- Create: `src/components/ReportEditMetaForm.test.tsx`
- Create: `src/components/ReportEditMetaForm.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReportEditMetaForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportEditMetaForm from './ReportEditMetaForm';
import type { MetaDraft } from '@/types/report';

const VALUE: MetaDraft = {
    title: 'Week 21',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    sprintNumber: 77,
    reportDate: '2026-05-19',
};

describe('<ReportEditMetaForm>', () => {
    it('renders all fields with current values', () => {
        render(<ReportEditMetaForm value={VALUE} onChange={() => {}} errors={{}} />);
        expect(screen.getByLabelText(/title/i)).toHaveValue('Week 21');
        expect(screen.getByLabelText(/sprint/i)).toHaveValue(77);
        expect(screen.getByLabelText(/report date/i)).toHaveValue('2026-05-19');
    });

    it('calls onChange with new value when title changes', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Week 22' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, title: 'Week 22' });
    });

    it('coerces sprint number from string to number', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/sprint/i), { target: { value: '78' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, sprintNumber: 78 });
    });

    it('passes null sprint number for empty input', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/sprint/i), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, sprintNumber: null });
    });

    it('shows error message when errors prop set', () => {
        render(<ReportEditMetaForm value={VALUE} onChange={() => {}} errors={{ reportDate: 'Bad date' }} />);
        expect(screen.getByText('Bad date')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/components/ReportEditMetaForm.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ReportEditMetaForm.tsx`:

```tsx
'use client';

import type { MetaDraft } from '@/types/report';

export type MetaErrors = Partial<Record<keyof MetaDraft, string>>;

interface Props {
    value: MetaDraft;
    onChange: (next: MetaDraft) => void;
    errors: MetaErrors;
}

const fieldClass = (hasError: boolean) =>
    `w-full rounded border px-2 py-1 text-sm ${hasError ? 'border-red-500' : 'border-gray-300'}`;

const errorText = (msg?: string) =>
    msg ? <div className="mt-0.5 text-xs text-red-600">{msg}</div> : null;

export default function ReportEditMetaForm({ value, onChange, errors }: Props) {
    const update = <K extends keyof MetaDraft>(key: K, v: MetaDraft[K]) =>
        onChange({ ...value, [key]: v });

    return (
        <div className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50/50">
            <label className="col-span-2 text-xs text-gray-600">
                Title
                <input
                    type="text"
                    value={value.title}
                    onChange={(e) => update('title', e.target.value)}
                    className={fieldClass(!!errors.title)}
                />
                {errorText(errors.title)}
            </label>
            <label className="text-xs text-gray-600">
                Week label
                <input
                    type="text"
                    value={value.weekLabel}
                    onChange={(e) => update('weekLabel', e.target.value)}
                    className={fieldClass(!!errors.weekLabel)}
                />
                {errorText(errors.weekLabel)}
            </label>
            <label className="text-xs text-gray-600">
                Sprint number
                <input
                    type="number"
                    min={0}
                    value={value.sprintNumber ?? ''}
                    onChange={(e) =>
                        update('sprintNumber', e.target.value === '' ? null : Number(e.target.value))
                    }
                    className={fieldClass(!!errors.sprintNumber)}
                />
                {errorText(errors.sprintNumber)}
            </label>
            <label className="text-xs text-gray-600">
                Date range
                <input
                    type="text"
                    value={value.dateRange}
                    onChange={(e) => update('dateRange', e.target.value)}
                    placeholder="18/05 - 22/05"
                    className={fieldClass(!!errors.dateRange)}
                />
                {errorText(errors.dateRange)}
            </label>
            <label className="text-xs text-gray-600">
                Report date
                <input
                    type="date"
                    value={value.reportDate}
                    onChange={(e) => update('reportDate', e.target.value)}
                    className={fieldClass(!!errors.reportDate)}
                />
                {errorText(errors.reportDate)}
            </label>
        </div>
    );
}
```

- [ ] **Step 4: Run test, verify all pass**

```bash
npx vitest run src/components/ReportEditMetaForm.test.tsx
```

Expected: 5/5 green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportEditMetaForm.tsx src/components/ReportEditMetaForm.test.tsx
git commit -m "feat(ui): ReportEditMetaForm controlled form with error display"
```

---

## Task 8: `<ReportEditBody>` component

**Files:**
- Create: `src/components/ReportEditBody.tsx`
- Create: `src/components/ReportEditBody.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReportEditBody.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportEditBody from './ReportEditBody';

describe('<ReportEditBody>', () => {
    it('renders the initial HTML inside the editor', async () => {
        render(<ReportEditBody initialHtml="<p>hello <strong>world</strong></p>" onChange={() => {}} />);
        await waitFor(() => expect(screen.getByText('hello')).toBeTruthy());
        expect(screen.getByText('world').tagName.toLowerCase()).toBe('strong');
    });

    it('calls onChange when content changes', async () => {
        const onChange = vi.fn();
        render(<ReportEditBody initialHtml="<p>x</p>" onChange={onChange} />);
        await waitFor(() => screen.getByText('x'));
        // Simulate typing by toggling source mode and changing content
        const sourceToggle = screen.getByRole('button', { name: /html source/i });
        fireEvent.click(sourceToggle);
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: '<p>y</p>' } });
        fireEvent.click(screen.getByRole('button', { name: /back to editor/i }));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<p>y</p>')));
    });

    it('renders toolbar buttons', async () => {
        render(<ReportEditBody initialHtml="<p>x</p>" onChange={() => {}} />);
        expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /heading 1/i })).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/components/ReportEditBody.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ReportEditBody.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';

interface Props {
    initialHtml: string;
    onChange: (html: string) => void;
}

export default function ReportEditBody({ initialHtml, onChange }: Props) {
    const [sourceMode, setSourceMode] = useState(false);
    const [sourceDraft, setSourceDraft] = useState('');

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
            Underline,
            Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
            Image.configure({ inline: false, allowBase64: true }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: initialHtml,
        onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
        // Required for SSR with Next.js App Router (React 19).
        immediatelyRender: false,
    });

    useEffect(() => () => { editor?.destroy(); }, [editor]);

    const enterSource = () => {
        if (!editor) return;
        setSourceDraft(editor.getHTML());
        setSourceMode(true);
    };
    const exitSource = () => {
        if (!editor) return;
        editor.commands.setContent(sourceDraft);
        onChange(sourceDraft);
        setSourceMode(false);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50/50 text-xs">
                {!sourceMode && editor && (
                    <>
                        <ToolbarButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
                        <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
                        <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolbarButton>
                        <ToolbarButton label="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
                        <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
                        <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Insert table" active={false} onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>⊞</ToolbarButton>
                    </>
                )}
                <div className="ml-auto">
                    <ToolbarButton
                        label={sourceMode ? 'Back to editor' : 'HTML source'}
                        active={sourceMode}
                        onClick={sourceMode ? exitSource : enterSource}
                    >
                        {sourceMode ? '← Editor' : 'HTML source'}
                    </ToolbarButton>
                </div>
            </div>
            {sourceMode ? (
                <textarea
                    value={sourceDraft}
                    onChange={(e) => setSourceDraft(e.target.value)}
                    className="flex-1 min-h-0 p-3 font-mono text-xs border-none outline-none resize-none"
                    spellCheck={false}
                />
            ) : (
                <div className="flex-1 min-h-0 overflow-auto report-prose text-sm leading-relaxed">
                    <EditorContent editor={editor} className="p-3 min-h-full focus:outline-none" />
                </div>
            )}
        </div>
    );
}

function Sep() {
    return <div className="h-4 w-px bg-gray-300 mx-1" />;
}

function ToolbarButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={`px-2 py-0.5 rounded border text-xs ${active ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
        >
            {children}
        </button>
    );
}
```

- [ ] **Step 4: Run test, verify all pass**

```bash
npx vitest run src/components/ReportEditBody.test.tsx
```

Expected: 3/3 green. If a test fails because TipTap doesn't render text right away under jsdom, increase the `waitFor` timeout to 2000ms.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportEditBody.tsx src/components/ReportEditBody.test.tsx
git commit -m "feat(ui): ReportEditBody TipTap editor + toolbar + HTML source toggle"
```

---

## Task 9: `<ReportPopup>` edit mode wiring

**Files:**
- Modify: `src/components/ReportPopup.tsx`
- Modify: `src/components/ReportPopup.test.tsx`

This task is large because it integrates the edit mode into the existing popup. Take it slow.

- [ ] **Step 1: Add `canEdit` prop and `mode` state**

Open `src/components/ReportPopup.tsx`. Update the `Props` interface and component signature:

```tsx
interface Props {
    report: Report;
    canEdit: boolean;
    onClose: () => void;
    onDownload: () => void;
    onSaved?: (updated: Report) => void;
}
```

At the top of the component body, add new state:

```tsx
const [mode, setMode] = useState<'view' | 'edit'>('view');
const [localReport, setLocalReport] = useState(report);
const [draftMeta, setDraftMeta] = useState<MetaDraft>({
    title: report.title,
    weekLabel: report.weekLabel ?? '',
    dateRange: report.dateRange ?? '',
    sprintNumber: report.sprintNumber,
    reportDate: report.reportDate,
});
const [draftHtml, setDraftHtml] = useState(report.htmlContent);
const [saving, setSaving] = useState(false);
const [errors, setErrors] = useState<MetaErrors>({});
```

When the `report` prop changes (a fresh report opens), reset all local state:

```tsx
useEffect(() => {
    setLocalReport(report);
    setDraftMeta({
        title: report.title,
        weekLabel: report.weekLabel ?? '',
        dateRange: report.dateRange ?? '',
        sprintNumber: report.sprintNumber,
        reportDate: report.reportDate,
    });
    setDraftHtml(report.htmlContent);
    setMode('view');
    setErrors({});
}, [report.id]);

const dirty = useMemo(() => {
    return Object.keys(buildPatchPayload(localReport, draftMeta, draftHtml)).length > 0;
}, [localReport, draftMeta, draftHtml]);
```

Add the imports at the top of the file:

```tsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Pencil } from 'lucide-react';
import ReportEditMetaForm, { type MetaErrors } from './ReportEditMetaForm';
import ReportEditBody from './ReportEditBody';
import { buildPatchPayload } from '@/utils/buildPatchPayload';
import type { Report, MetaDraft, ReportErrorBody } from '@/types/report';
```

(Keep the existing icon imports `X, Download, GripHorizontal` and merge `Pencil` into the same import block.)

- [ ] **Step 2: Add validation helper**

Inside the component:

```tsx
const validate = useCallback((draft: MetaDraft): MetaErrors => {
    const e: MetaErrors = {};
    if (!draft.title.trim()) e.title = 'Required';
    if (draft.sprintNumber !== null && (!Number.isFinite(draft.sprintNumber) || draft.sprintNumber < 0)) {
        e.sprintNumber = 'Must be a non-negative number';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reportDate)) {
        e.reportDate = 'Format YYYY-MM-DD';
    }
    return e;
}, []);
```

- [ ] **Step 3: Add save handler**

```tsx
const handleSave = useCallback(async () => {
    const e = validate(draftMeta);
    if (Object.keys(e).length > 0) {
        setErrors(e);
        return;
    }
    setErrors({});
    const patch = buildPatchPayload(localReport, draftMeta, draftHtml);
    if (Object.keys(patch).length === 0) {
        setMode('view');
        return;
    }
    setSaving(true);
    try {
        const res = await fetch(`/api/reports/${localReport.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
            alert(body.error || `Save failed (${res.status})`);
            return;
        }
        const data = (await res.json()) as { report: Report };
        setLocalReport(data.report);
        setDraftMeta({
            title: data.report.title,
            weekLabel: data.report.weekLabel ?? '',
            dateRange: data.report.dateRange ?? '',
            sprintNumber: data.report.sprintNumber,
            reportDate: data.report.reportDate,
        });
        setDraftHtml(data.report.htmlContent);
        setMode('view');
        onSaved?.(data.report);
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
        setSaving(false);
    }
}, [draftMeta, draftHtml, localReport, validate, onSaved]);

const handleCancel = useCallback(() => {
    if (dirty && !confirm('Hủy thay đổi chưa lưu?')) return;
    setDraftMeta({
        title: localReport.title,
        weekLabel: localReport.weekLabel ?? '',
        dateRange: localReport.dateRange ?? '',
        sprintNumber: localReport.sprintNumber,
        reportDate: localReport.reportDate,
    });
    setDraftHtml(localReport.htmlContent);
    setErrors({});
    setMode('view');
}, [dirty, localReport]);
```

- [ ] **Step 4: Add replace-file handler**

```tsx
const fileInputRef = useRef<HTMLInputElement | null>(null);

const handleReplaceClick = () => fileInputRef.current?.click();

const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file later
    if (!file) return;
    setSaving(true);
    try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/reports/${localReport.id}/file`, { method: 'PUT', body: form });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
            alert(body.error || `Replace failed (${res.status})`);
            return;
        }
        const data = (await res.json()) as { report: Report };
        setLocalReport(data.report);
        setDraftMeta({
            title: data.report.title,
            weekLabel: data.report.weekLabel ?? '',
            dateRange: data.report.dateRange ?? '',
            sprintNumber: data.report.sprintNumber,
            reportDate: data.report.reportDate,
        });
        setDraftHtml(data.report.htmlContent);
        // Stay in edit mode so user can review.
        onSaved?.(data.report);
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Replace failed');
    } finally {
        setSaving(false);
    }
}, [localReport.id, onSaved]);
```

- [ ] **Step 5: Update ESC handler**

Replace the existing keydown effect:

```tsx
useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (mode === 'view') {
            onClose();
        } else {
            handleCancel();
        }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
}, [mode, onClose, handleCancel]);
```

- [ ] **Step 6: Render edit mode JSX**

Replace the existing header and body JSX. The complete render now looks like this (full replacement of the `return (...)` block):

```tsx
return (
    <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={localReport.title}
        tabIndex={-1}
        className="fixed bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col"
        style={{ left: state.x, top: state.y, width: state.width, height: state.height, zIndex: 60 }}
    >
        <div
            ref={headerRef}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none rounded-t-lg"
        >
            <GripHorizontal className="w-4 h-4 text-gray-400" aria-hidden />
            {mode === 'view' ? (
                <div className="flex-1 truncate text-sm font-semibold text-gray-800">{localReport.title}</div>
            ) : (
                <input
                    type="text"
                    value={draftMeta.title}
                    onChange={(e) => setDraftMeta({ ...draftMeta, title: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Title"
                    className="flex-1 px-2 py-0.5 text-sm font-semibold border border-gray-300 rounded"
                />
            )}
            {canEdit && mode === 'view' && (
                <button onClick={() => setMode('edit')} aria-label="Edit" title="Edit" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                    <Pencil className="w-4 h-4" />
                </button>
            )}
            <button onClick={onDownload} aria-label="Download original .docx" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                <Download className="w-4 h-4" />
            </button>
            <button onClick={mode === 'view' ? onClose : handleCancel} aria-label="Close" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                <X className="w-4 h-4" />
            </button>
        </div>

        {mode === 'edit' && (
            <ReportEditMetaForm value={draftMeta} onChange={setDraftMeta} errors={errors} />
        )}

        {mode === 'view' ? (
            <div
                className="flex-1 overflow-auto p-4 report-prose text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: localReport.htmlContent }}
            />
        ) : (
            <ReportEditBody initialHtml={localReport.htmlContent} onChange={setDraftHtml} />
        )}

        {mode === 'edit' && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50/50" onPointerDown={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={handleReplaceClick}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
                >
                    ⬆ Replace .docx
                </button>
                <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileSelected} className="hidden" />
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded hover:bg-gray-200"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:bg-gray-300"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        )}

        {HANDLES.map((h) => (
            <ResizeHandle
                key={h.dir}
                containerRef={containerRef}
                dir={h.dir}
                className={h.className}
                cursor={h.cursor}
                onResize={setBounds}
                showSeMarker={h.dir === 'se'}
            />
        ))}
    </div>
);
```

- [ ] **Step 7: Type-check + run existing tests**

```bash
npx tsc --noEmit
npx vitest run src/components/ReportPopup.test.tsx
```

Expected: tsc clean. Existing 4 tests should still pass — the test file passes `canEdit` to the component once.

Update the existing test file to pass `canEdit`. Replace each `render(<ReportPopup report={REPORT} onClose={...} onDownload={...} />)` with `render(<ReportPopup report={REPORT} canEdit={true} onClose={...} onDownload={...} />)`.

- [ ] **Step 8: Add new tests for edit mode**

In `src/components/ReportPopup.test.tsx`, append:

```tsx
describe('<ReportPopup> edit mode', () => {
    it('hides Edit button when canEdit is false', () => {
        render(<ReportPopup report={REPORT} canEdit={false} onClose={() => {}} onDownload={() => {}} />);
        expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    });

    it('enters edit mode when Edit clicked', () => {
        render(<ReportPopup report={REPORT} canEdit={true} onClose={() => {}} onDownload={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
        expect(screen.getByLabelText(/title/i)).toBeTruthy();
    });

    it('Cancel exits edit mode without saving', () => {
        render(<ReportPopup report={REPORT} canEdit={true} onClose={() => {}} onDownload={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(screen.queryByLabelText(/title/i)).toBeNull();
    });
});
```

Run them:

```bash
npx vitest run src/components/ReportPopup.test.tsx
```

Expected: 7/7 green (4 existing + 3 new).

- [ ] **Step 9: Commit**

```bash
git add src/components/ReportPopup.tsx src/components/ReportPopup.test.tsx
git commit -m "feat(ui): ReportPopup edit mode with save + replace-file flows"
```

---

## Task 10: Wire `canEdit` from page

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

- [ ] **Step 1: Update the `<ReportPopup>` render**

Find the `<ReportPopup ... />` JSX in `src/app/roadmap/[id]/page.tsx`. Add `canEdit={canManageRoadmap}` and `onSaved={() => { void loadMonths(); /* if needed */ }}` (but if the page doesn't already expose `loadMonths`, you can simply skip `onSaved` for now since the popup already updates its local state).

Concretely, the props should now be:

```tsx
<ReportPopup
    report={activeReport}
    canEdit={canManageRoadmap}
    onClose={() => setActiveReportId(null)}
    onDownload={async () => {
        const res = await fetch(`/api/reports/${activeReport.id}/download`);
        if (!res.ok) return;
        const data = (await res.json()) as { url: string };
        window.open(data.url, '_blank');
    }}
/>
```

(Match the existing onDownload handler shape exactly; only `canEdit` is new.)

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/roadmap/[id]/page.tsx"
git commit -m "feat(page): pass canEdit to ReportPopup for edit-mode gating"
```

---

## Task 11: Refresh ReportsPanel after save (optional polish)

**Files:**
- Modify: `src/components/ReportsPanel.tsx` and `src/app/roadmap/[id]/page.tsx`

This is a small UX polish: when a save changes `title` or `month`, the list should reflect it.

- [ ] **Step 1: Add `onReportUpdated` callback on `<ReportPopup>`**

Already added in Task 9 as `onSaved`. Now wire it.

In `src/app/roadmap/[id]/page.tsx`, lift a refresh trigger:

```tsx
const [reportsRefreshTick, setReportsRefreshTick] = useState(0);
```

Pass to ReportsPanel:

```tsx
<ReportsPanel
    canEdit={canManageRoadmap}
    refreshKey={reportsRefreshTick}
    onSelect={setActiveReportId}
    onClose={() => setIsReportsPanelOpen(false)}
    onToast={(message, kind) => addToast(message, kind ?? 'success')}
/>
```

Pass `onSaved` to ReportPopup:

```tsx
onSaved={() => setReportsRefreshTick((t) => t + 1)}
```

- [ ] **Step 2: Make `ReportsPanel` react to `refreshKey`**

In `src/components/ReportsPanel.tsx`, add `refreshKey?: number` to `Props` and add a dependency in the useEffect that loads reports:

```tsx
useEffect(() => { void loadMonths(); }, [loadMonths, refreshKey]);
useEffect(() => { void loadReports(selectedMonth); }, [loadReports, selectedMonth, refreshKey]);
```

Add to the destructured props at the top: `refreshKey,`.

- [ ] **Step 3: Type-check + tests**

```bash
npx tsc --noEmit
npx vitest run src/components/ReportsPanel.test.tsx
```

Existing 3 tests still pass (they don't pass refreshKey; the prop is optional).

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportsPanel.tsx src/app/roadmap/\[id\]/page.tsx
git commit -m "feat(ui): refresh ReportsPanel when popup saves"
```

---

## Task 12: README env vars (no new vars, just doc the new endpoints)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Production Upload Checklist**

In `README.md`, find the section that lists the report endpoints. Append the new ones:

```markdown
- `PATCH /api/reports/[id]` (editor-only, rate-limited by REPORT_UPLOAD_RATE_LIMIT_*) — edit metadata + HTML content
- `PUT /api/reports/[id]/file` (editor-only, rate-limited by REPORT_UPLOAD_RATE_LIMIT_*) — replace original `.docx`
```

And add to the smoke tests bullet group:

```markdown
- Editor: open popup → Edit → change title → Save → list refreshes with new title
- Editor: in edit mode → Replace .docx → content updates, popup stays in edit mode
- Non-editor: PATCH and PUT both return 401
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document PATCH + PUT file endpoints for report editing"
```

---

## Task 13: Manual smoke test

This is human-driven; document outcomes in a follow-up commit if anything needs adjusting.

- [ ] **Step 1: Restart dev server in worktree**

```bash
npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify Edit button is editor-gated**

- Logged in as editor → open a roadmap → open a report popup → see ✏️ Edit button.
- Log out (or open incognito) → open same report popup → no Edit button.

- [ ] **Step 3: Edit metadata + save**

- Click Edit → change Title to something distinct → Save.
- Verify: popup returns to view mode, title updates, list in side panel refreshes.

- [ ] **Step 4: Edit HTML content**

- Click Edit → in editor, select some text → click Bold → Save.
- Verify: view mode renders the new bold text.

- [ ] **Step 5: HTML source toggle**

- Click Edit → click "HTML source" → edit raw HTML (add `<h2>Test</h2>`) → click "← Editor" → Save.
- Verify: new heading appears in view mode.

- [ ] **Step 6: Replace .docx**

- Click Edit → click "⬆ Replace .docx" → pick a different `.docx` file → wait for upload.
- Verify: content area shows the new file's parsed HTML. Metadata fields may have auto-updated from re-parse.
- Save and confirm DB has new `original_filename` (check via Studio).
- Verify in Studio Storage: old file is gone, new file exists.

- [ ] **Step 7: Bad inputs**

- Edit → set Title to empty → Save → see inline error.
- Edit → set Report date to malformed → Save → see inline error.
- Replace .docx with a `.pdf` → see toast/alert with 400 error.

- [ ] **Step 8: Cancel with dirty changes**

- Edit → change something → press Esc OR click Cancel → see confirm dialog → "OK" discards.

- [ ] **Step 9: Run full test suite**

```bash
npm test
npm run lint
npx tsc --noEmit
```

All should be green (or only show pre-existing items).

- [ ] **Step 10: Commit any fixes**

If smoke revealed bugs, fix per the systematic-debugging skill and commit per-fix.

---

## Definition of Done

- `npm test`, `npm run lint`, `npx tsc --noEmit` all clean (or only pre-existing items).
- All 13 tasks committed in sequence.
- Manual smoke checklist passes.
- `README.md` updated.
- Spec at `docs/superpowers/specs/2026-05-25-weekly-report-edit-save-design.md` matches what was built.
