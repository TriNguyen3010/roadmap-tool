# Weekly Report Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reports" feature that lets editors upload `.docx` weekly reports, organizes them by month in a side panel, and renders each one inside a floating, draggable, resizable popup that persists its window state.

**Architecture:** Parse-on-upload — `mammoth.js` converts `.docx` to HTML, `isomorphic-dompurify` sanitizes it server-side, original file goes to a private Supabase Storage bucket, metadata + sanitized HTML go to a new Postgres `reports` table. Reads are pure DB lookups (no re-parsing). UI is a `SidePanelShell`-based directory plus a custom floating window driven by three small hooks (`useDraggable`, `useResizable`, `usePersistedWindow`).

**Tech Stack:** Next.js 16 (App Router, Node runtime), React 19, TypeScript, Supabase (Postgres + Storage), `mammoth`, `isomorphic-dompurify`, Vitest, Tailwind v4, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-05-24-weekly-report-popup-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260524120000_create_reports_table.sql` | Create `reports` table + index |
| `src/types/report.ts` | `Report`, `ReportListItem`, `ReportMetadata`, `ReportErrorCode` types |
| `src/utils/parseReportHeader.ts` (+ `.test.ts`) | Regex-based metadata extraction from raw text |
| `src/utils/sanitizeReportHtml.ts` (+ `.test.ts`) | DOMPurify wrapper with allow-list for Mammoth output |
| `src/utils/reportFilename.ts` (+ `.test.ts`) | Filename sanitization for Storage paths |
| `src/lib/reportsStorage.ts` | Supabase Storage helpers (upload, delete, signed URL) |
| `src/server/reportsRepo.ts` | DB access for `reports` (list, get, insert, delete, months) |
| `src/app/api/reports/route.ts` | `GET` list by month + `POST` upload |
| `src/app/api/reports/months/route.ts` | `GET` distinct months |
| `src/app/api/reports/[id]/route.ts` | `GET` full report + `DELETE` |
| `src/app/api/reports/[id]/download/route.ts` | `GET` signed URL for `.docx` |
| `src/hooks/useDraggable.ts` (+ `.test.tsx`) | Pointer-based drag for a referenced element via a referenced handle |
| `src/hooks/useResizable.ts` (+ `.test.tsx`) | South-east-corner resize with min/max clamp |
| `src/hooks/usePersistedWindow.ts` (+ `.test.tsx`) | Compose drag + resize + localStorage + viewport clamp |
| `src/components/ReportPopup.tsx` (+ `.test.tsx`) | Floating window rendering report HTML |
| `src/components/UploadReportDialog.tsx` | Modal dialog: pick file, show parsed metadata, confirm + upload |
| `src/components/ReportsPanel.tsx` (+ `.test.tsx`) | Side panel: month picker + report list + upload entry point |
| `src/test/fixtures/week21-sample.docx` | Real `.docx` for integration tests (copied from user's Downloads) |

### Modified files

| Path | Change |
|---|---|
| `package.json` | Add `mammoth`, `isomorphic-dompurify` deps |
| `src/components/Toolbar.tsx` | New "Reports" button + props |
| `src/app/roadmap/[id]/page.tsx` | State for `isReportsPanelOpen` + `activeReportId`, render new components |
| `README.md` | Document new env vars |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

Run from project root:
```bash
npm install mammoth@^1.8.0 isomorphic-dompurify@^2.16.0
```

Expected: both packages added to `dependencies` in `package.json`; lockfile updated.

- [ ] **Step 2: Verify install + types**

Run:
```bash
npm run build
```

Expected: build succeeds. If TypeScript complains about missing types, both packages ship their own — no extra `@types/*` install needed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add mammoth + isomorphic-dompurify for report parsing"
```

---

## Task 2: Database migration for `reports` table

**Files:**
- Create: `supabase/migrations/20260524120000_create_reports_table.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260524120000_create_reports_table.sql` with this exact content:

```sql
-- Weekly report library: stores parsed HTML of uploaded .docx files
-- See docs/superpowers/specs/2026-05-24-weekly-report-popup-design.md

create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),

    -- Filtering / sorting
    month text not null,                       -- 'YYYY-MM'
    report_date date not null,
    sprint_number int,

    -- Display
    title text not null,
    week_label text,
    date_range text,

    -- Content
    original_filename text not null,
    original_storage_path text not null,
    html_content text not null,
    raw_text text,

    -- Audit
    uploaded_by text,
    file_size_bytes int not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists reports_month_idx
    on public.reports (month, report_date desc, sprint_number desc);

-- Touch updated_at automatically
create or replace function public.reports_touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
    before update on public.reports
    for each row execute function public.reports_touch_updated_at();
```

- [ ] **Step 2: Apply migration locally**

Run:
```bash
npx supabase db reset
```

(Or `npx supabase migration up` if the project keeps existing data.)

Expected: migration runs without error. Verify by listing tables — `reports` should appear.

- [ ] **Step 3: Create the Storage bucket**

In Supabase Studio (or via CLI), create a **private** bucket named `reports`. CLI alternative:

```bash
npx supabase storage create reports --public=false
```

Expected: bucket appears in Storage and is **not** public.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524120000_create_reports_table.sql
git commit -m "feat(db): add reports table + index for weekly report library"
```

---

## Task 3: Types

**Files:**
- Create: `src/types/report.ts`

- [ ] **Step 1: Write the types**

Create `src/types/report.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/report.ts
git commit -m "feat(types): add Report wire types + error codes"
```

---

## Task 4: `parseReportHeader` utility (TDD)

**Files:**
- Create: `src/utils/parseReportHeader.test.ts`
- Create: `src/utils/parseReportHeader.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/parseReportHeader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseReportHeader } from './parseReportHeader';

const WEEK21_SAMPLE = `BÁO CÁO TEAM WALLET
Ngày: 19/05/2026
1. TỔNG QUAN
Có thể submit...
2. SPRINT 77 (16.12.2)
Chặn user IP Việt Nam
SW _ Week 21 Report _ 18/05 - 22/05`;

describe('parseReportHeader', () => {
    it('extracts metadata from a full Week 21 sample', () => {
        const meta = parseReportHeader(WEEK21_SAMPLE);
        expect(meta.weekLabel).toBe('Week 21');
        expect(meta.dateRange).toBe('18/05 - 22/05');
        expect(meta.sprintNumber).toBe(77);
        expect(meta.reportDate).toBe('2026-05-19');
        expect(meta.month).toBe('2026-05');
    });

    it('falls back when sprint is missing', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026\nWeek 21 Report');
        expect(meta.sprintNumber).toBeNull();
        expect(meta.weekLabel).toBe('Week 21');
    });

    it('falls back when week label is missing', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026\nSPRINT 77');
        expect(meta.weekLabel).toBeNull();
        expect(meta.sprintNumber).toBe(77);
    });

    it('falls back to today when report date is missing', () => {
        const meta = parseReportHeader('Random text without date');
        expect(meta.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(meta.month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('builds a sensible title from week + date range', () => {
        const meta = parseReportHeader(WEEK21_SAMPLE);
        expect(meta.title).toBe('Week 21 · 18/05 - 22/05');
    });

    it('falls back title to "Report YYYY-MM-DD" when no week/range', () => {
        const meta = parseReportHeader('Ngày: 19/05/2026');
        expect(meta.title).toBe('Report 2026-05-19');
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
npx vitest run src/utils/parseReportHeader.test.ts
```

Expected: FAIL — `parseReportHeader` module not found.

- [ ] **Step 3: Implement**

Create `src/utils/parseReportHeader.ts`:

```ts
import type { ReportMetadata } from '@/types/report';

const DATE_RE = /Ngày:\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const WEEK_RE = /Week\s+(\d+)/i;
const RANGE_RE = /(\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2})/;
const SPRINT_RE = /SPRINT\s+(\d+)/i;

const pad = (n: number) => String(n).padStart(2, '0');

const todayIso = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const parseReportHeader = (rawText: string): ReportMetadata => {
    const head = (rawText || '').slice(0, 4000);

    const dateMatch = head.match(DATE_RE);
    const reportDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        : todayIso();
    const month = reportDate.slice(0, 7);

    const weekMatch = head.match(WEEK_RE);
    const weekLabel = weekMatch ? `Week ${weekMatch[1]}` : null;

    const rangeMatch = head.match(RANGE_RE);
    const dateRange = rangeMatch ? `${rangeMatch[1]} - ${rangeMatch[2]}` : null;

    const sprintMatch = head.match(SPRINT_RE);
    const sprintNumber = sprintMatch ? Number(sprintMatch[1]) : null;

    const title =
        weekLabel && dateRange
            ? `${weekLabel} · ${dateRange}`
            : weekLabel
                ? weekLabel
                : `Report ${reportDate}`;

    return { month, reportDate, sprintNumber, weekLabel, dateRange, title };
};
```

- [ ] **Step 4: Run test, verify pass**

Run:
```bash
npx vitest run src/utils/parseReportHeader.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parseReportHeader.ts src/utils/parseReportHeader.test.ts
git commit -m "feat(utils): parseReportHeader extracts metadata from docx text"
```

---

## Task 5: `sanitizeReportHtml` utility (TDD)

**Files:**
- Create: `src/utils/sanitizeReportHtml.test.ts`
- Create: `src/utils/sanitizeReportHtml.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/sanitizeReportHtml.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
npx vitest run src/utils/sanitizeReportHtml.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/sanitizeReportHtml.ts`:

```ts
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
```

- [ ] **Step 4: Run test, verify pass**

Run:
```bash
npx vitest run src/utils/sanitizeReportHtml.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sanitizeReportHtml.ts src/utils/sanitizeReportHtml.test.ts
git commit -m "feat(utils): sanitizeReportHtml with DOMPurify allow-list"
```

---

## Task 6: `reportFilename` sanitization (TDD)

**Files:**
- Create: `src/utils/reportFilename.test.ts`
- Create: `src/utils/reportFilename.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/reportFilename.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeReportFilename, buildStoragePath } from './reportFilename';

describe('sanitizeReportFilename', () => {
    it('replaces path separators and dotdot', () => {
        expect(sanitizeReportFilename('../../etc/passwd.docx')).toBe('etc_passwd.docx');
        expect(sanitizeReportFilename('foo/bar.docx')).toBe('foo_bar.docx');
        expect(sanitizeReportFilename('foo\\bar.docx')).toBe('foo_bar.docx');
    });

    it('strips control chars but preserves Vietnamese diacritics', () => {
        const out = sanitizeReportFilename('Báo cáo tuần 21 .docx');
        expect(out).toBe('Báo cáo tuần 21.docx');
    });

    it('preserves spaces and collapses repeats', () => {
        expect(sanitizeReportFilename('a   b.docx')).toBe('a b.docx');
    });

    it('forces .docx extension when missing', () => {
        expect(sanitizeReportFilename('plain')).toBe('plain.docx');
    });

    it('truncates very long names', () => {
        const long = 'x'.repeat(300) + '.docx';
        const out = sanitizeReportFilename(long);
        expect(out.length).toBeLessThanOrEqual(120);
        expect(out.endsWith('.docx')).toBe(true);
    });
});

describe('buildStoragePath', () => {
    it('builds <month>/<uuid>-<safe>.docx', () => {
        const path = buildStoragePath('2026-05', 'aaaa-bbbb', 'Week 21.docx');
        expect(path).toBe('2026-05/aaaa-bbbb-Week 21.docx');
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/utils/reportFilename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/reportFilename.ts`:

```ts
const MAX_NAME_LEN = 120;

export const sanitizeReportFilename = (raw: string): string => {
    let name = (raw || '').trim();
    // Replace path separators
    name = name.replace(/[\\/]+/g, '_');
    // Remove ".." sequences
    name = name.replace(/\.{2,}/g, '_');
    // Strip control chars (keep printable Unicode incl. diacritics)
    name = name.replace(/[\x00-\x1F\x7F]/g, '');
    // Collapse whitespace
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) name = 'report';
    // Enforce .docx
    if (!/\.docx$/i.test(name)) name = `${name}.docx`;
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
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/utils/reportFilename.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/reportFilename.ts src/utils/reportFilename.test.ts
git commit -m "feat(utils): sanitize report filenames + storage path builder"
```

---

## Task 7: `reportsStorage` library

**Files:**
- Create: `src/lib/reportsStorage.ts`

This wraps Supabase Storage so the API routes stay thin. No unit test for this one — it touches Supabase; we test it via API route smoke later.

- [ ] **Step 1: Implement**

Create `src/lib/reportsStorage.ts`:

```ts
import { supabase } from '@/lib/supabase';

const BUCKET = process.env.REPORT_STORAGE_BUCKET || 'reports';
const DOWNLOAD_TTL_SECONDS = 60;

export const uploadReportFile = async (params: {
    storagePath: string;
    buffer: Buffer;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(params.storagePath, params.buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: false,
        });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
};

export const deleteReportFile = async (storagePath: string): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
};

export const createReportSignedUrl = async (storagePath: string): Promise<{ url: string } | { error: string }> => {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, DOWNLOAD_TTL_SECONDS);
    if (error || !data) return { error: error?.message || 'sign failed' };
    return { url: data.signedUrl };
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reportsStorage.ts
git commit -m "feat(lib): reportsStorage helpers (upload/delete/signed-url)"
```

---

## Task 8: `reportsRepo` (DB access)

**Files:**
- Create: `src/server/reportsRepo.ts`

- [ ] **Step 1: Implement**

Create `src/server/reportsRepo.ts`:

```ts
import { supabase } from '@/lib/supabase';
import type { Report, ReportListItem } from '@/types/report';

type DbRow = {
    id: string;
    month: string;
    report_date: string;
    sprint_number: number | null;
    title: string;
    week_label: string | null;
    date_range: string | null;
    original_filename: string;
    original_storage_path: string;
    html_content: string;
    raw_text: string | null;
    uploaded_by: string | null;
    file_size_bytes: number;
    created_at: string;
    updated_at: string;
};

const toReport = (row: DbRow): Report => ({
    id: row.id,
    month: row.month,
    reportDate: row.report_date,
    sprintNumber: row.sprint_number,
    title: row.title,
    weekLabel: row.week_label,
    dateRange: row.date_range,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    htmlContent: row.html_content,
});

const toListItem = (row: Omit<DbRow, 'html_content' | 'raw_text'>): ReportListItem => ({
    id: row.id,
    month: row.month,
    reportDate: row.report_date,
    sprintNumber: row.sprint_number,
    title: row.title,
    weekLabel: row.week_label,
    dateRange: row.date_range,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const LIST_COLUMNS = 'id,month,report_date,sprint_number,title,week_label,date_range,original_filename,original_storage_path,uploaded_by,file_size_bytes,created_at,updated_at';
const FULL_COLUMNS = `${LIST_COLUMNS},html_content,raw_text`;

export const listMonths = async (): Promise<string[]> => {
    const { data, error } = await supabase
        .from('reports')
        .select('month')
        .order('month', { ascending: false });
    if (error) throw new Error(`listMonths: ${error.message}`);
    const unique = Array.from(new Set((data ?? []).map((r) => r.month as string)));
    return unique;
};

export const listReportsByMonth = async (month: string): Promise<ReportListItem[]> => {
    const { data, error } = await supabase
        .from('reports')
        .select(LIST_COLUMNS)
        .eq('month', month)
        .order('report_date', { ascending: false })
        .order('sprint_number', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listReportsByMonth: ${error.message}`);
    return (data ?? []).map((row) => toListItem(row as Omit<DbRow, 'html_content' | 'raw_text'>));
};

export const getReportById = async (id: string): Promise<Report | null> => {
    const { data, error } = await supabase
        .from('reports')
        .select(FULL_COLUMNS)
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`getReportById: ${error.message}`);
    if (!data) return null;
    return toReport(data as DbRow);
};

export const getReportStoragePath = async (id: string): Promise<string | null> => {
    const { data, error } = await supabase
        .from('reports')
        .select('original_storage_path')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`getReportStoragePath: ${error.message}`);
    return (data?.original_storage_path as string | undefined) ?? null;
};

export const insertReport = async (input: Omit<Report, 'id' | 'createdAt' | 'updatedAt'> & {
    originalStoragePath: string;
    rawText: string | null;
}): Promise<Report> => {
    const { data, error } = await supabase
        .from('reports')
        .insert({
            month: input.month,
            report_date: input.reportDate,
            sprint_number: input.sprintNumber,
            title: input.title,
            week_label: input.weekLabel,
            date_range: input.dateRange,
            original_filename: input.originalFilename,
            original_storage_path: input.originalStoragePath,
            html_content: input.htmlContent,
            raw_text: input.rawText,
            uploaded_by: input.uploadedBy,
            file_size_bytes: input.fileSizeBytes,
        })
        .select(FULL_COLUMNS)
        .single();
    if (error || !data) throw new Error(`insertReport: ${error?.message || 'no data'}`);
    return toReport(data as DbRow);
};

export const deleteReport = async (id: string): Promise<{ storagePath: string } | null> => {
    const storagePath = await getReportStoragePath(id);
    if (!storagePath) return null;
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) throw new Error(`deleteReport: ${error.message}`);
    return { storagePath };
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/reportsRepo.ts
git commit -m "feat(server): reportsRepo for DB CRUD"
```

---

## Task 9: `GET /api/reports/months`

**Files:**
- Create: `src/app/api/reports/months/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/reports/months/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { listMonths } from '@/server/reportsRepo';

export const runtime = 'nodejs';

const todayMonth = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export async function GET(_request: NextRequest) {
    const requestId = randomUUID();
    try {
        const months = await listMonths();
        const result = months.length > 0 ? months : [todayMonth()];
        return NextResponse.json({ months: result, requestId });
    } catch (error) {
        console.error(`[reports/months:${requestId}] failed`, error);
        return NextResponse.json(
            { error: 'Failed to list months', code: 'INTERNAL', requestId },
            { status: 500 }
        );
    }
}
```

- [ ] **Step 2: Smoke test**

Start dev server in a separate terminal (`npm run dev`), then:

```bash
curl -s http://localhost:3000/api/reports/months | head -c 400
```

Expected: JSON `{ "months": ["2026-05"], "requestId": "..." }` (today's month when DB empty).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/months/route.ts
git commit -m "feat(api): GET /api/reports/months"
```

---

## Task 10: `GET /api/reports?month=` + `POST /api/reports`

**Files:**
- Create: `src/app/api/reports/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/reports/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { parseReportHeader } from '@/utils/parseReportHeader';
import { sanitizeReportHtml } from '@/utils/sanitizeReportHtml';
import { buildStoragePath } from '@/utils/reportFilename';
import { listReportsByMonth, insertReport } from '@/server/reportsRepo';
import { uploadReportFile, deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const MAX_MB = readPositiveIntEnv('REPORT_UPLOAD_MAX_MB', 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const UPLOAD_RATE_MAX = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_MAX', 10);
const UPLOAD_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const err = (
    code: ReportErrorCode,
    message: string,
    status: number,
    requestId: string,
    extra?: Record<string, unknown>,
) => NextResponse.json({ error: message, code, requestId, ...(extra ?? {}) }, { status });

export async function GET(request: NextRequest) {
    const requestId = randomUUID();
    try {
        const month = request.nextUrl.searchParams.get('month');
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return err('BAD_REQUEST', 'Query param `month` must be YYYY-MM', 400, requestId);
        }
        const reports = await listReportsByMonth(month);
        return NextResponse.json({ reports, requestId });
    } catch (error) {
        console.error(`[reports.GET:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to list reports', 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = randomUUID();
    let uploadedPath: string | null = null;
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-upload',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: UPLOAD_RATE_MAX,
            windowMs: UPLOAD_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many uploads', code: 'RATE_LIMITED', requestId },
                {
                    status: 429,
                    headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
                },
            );
        }

        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return err('NO_FILE', 'File is required', 400, requestId);

        if (file.type && file.type !== DOCX_MIME && !file.name.toLowerCase().endsWith('.docx')) {
            return err('INVALID_FILE_TYPE', 'Only .docx files are allowed', 400, requestId);
        }
        if (file.size > MAX_BYTES) {
            return err('FILE_TOO_LARGE', `File exceeds ${MAX_MB}MB`, 400, requestId);
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

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
            console.error(`[reports.POST:${requestId}] mammoth failed`, parseError);
            return err('PARSE_FAILED', 'Could not parse .docx', 422, requestId);
        }

        const cleanHtml = sanitizeReportHtml(rawHtml);

        // Allow optional client overrides from the upload dialog
        const overrides = (() => {
            const raw = form.get('metadata');
            if (typeof raw !== 'string' || !raw) return null;
            try {
                return JSON.parse(raw) as Partial<{
                    month: string; reportDate: string; sprintNumber: number | null;
                    weekLabel: string | null; dateRange: string | null; title: string;
                }>;
            } catch { return null; }
        })();

        const parsed = parseReportHeader(rawText);
        const meta = { ...parsed, ...(overrides ?? {}) };

        const uuid = randomUUID();
        const storagePath = buildStoragePath(meta.month, uuid, file.name);

        const uploadResult = await uploadReportFile({ storagePath, buffer });
        if (!uploadResult.ok) {
            return err('STORAGE_ERROR', 'Storage upload failed', 500, requestId, { details: uploadResult.error });
        }
        uploadedPath = storagePath;

        try {
            const row = await insertReport({
                month: meta.month,
                reportDate: meta.reportDate,
                sprintNumber: meta.sprintNumber,
                title: meta.title,
                weekLabel: meta.weekLabel,
                dateRange: meta.dateRange,
                originalFilename: file.name,
                originalStoragePath: storagePath,
                htmlContent: cleanHtml,
                rawText,
                uploadedBy: auth.sessionUser.label || auth.sessionUser.email,
                fileSizeBytes: file.size,
            });
            return NextResponse.json({ report: row, requestId });
        } catch (dbError) {
            console.error(`[reports.POST:${requestId}] db insert failed, rolling back storage`, dbError);
            await deleteReportFile(storagePath).catch(() => {});
            uploadedPath = null;
            return err('DB_ERROR', 'Database insert failed', 500, requestId);
        }
    } catch (error) {
        console.error(`[reports.POST:${requestId}] unexpected`, error);
        if (uploadedPath) await deleteReportFile(uploadedPath).catch(() => {});
        return err('INTERNAL', 'Upload failed', 500, requestId);
    }
}
```

- [ ] **Step 2: Smoke test GET**

With dev server running:

```bash
curl -s "http://localhost:3000/api/reports?month=2026-05" | head -c 400
```

Expected: `{ "reports": [], "requestId": "..." }`.

- [ ] **Step 3: Smoke test POST unauthorized**

```bash
curl -s -X POST http://localhost:3000/api/reports -F "file=@/Users/nguyenminhtri/Downloads/SW _ Week 21 Report _ 1805 -2205.docx" -o /tmp/resp.json -w "%{http_code}\n"
cat /tmp/resp.json
```

Expected: `401`, body `{ "error": "Unauthorized", "code": "UNAUTHORIZED", ... }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/route.ts
git commit -m "feat(api): GET list by month + POST upload reports"
```

---

## Task 11: `GET /api/reports/[id]` + `DELETE /api/reports/[id]`

**Files:**
- Create: `src/app/api/reports/[id]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/reports/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportById, deleteReport } from '@/server/reportsRepo';
import { deleteReportFile } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const DELETE_RATE_MAX = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_MAX', 20);
const DELETE_RATE_WINDOW_MS = readPositiveIntEnv('REPORT_DELETE_RATE_LIMIT_WINDOW_MS', 60_000);

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    try {
        const report = await getReportById(id);
        if (!report) return err('NOT_FOUND', 'Report not found', 404, requestId);
        return NextResponse.json({ report, requestId });
    } catch (error) {
        console.error(`[reports.GET:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to fetch report', 500, requestId);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) return err('UNAUTHORIZED', 'Unauthorized', 401, requestId);

        const rate = checkRateLimit({
            scope: 'reports-delete',
            key: getRateLimitKey(request, auth.sessionUser.email),
            limit: DELETE_RATE_MAX,
            windowMs: DELETE_RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many delete requests', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const result = await deleteReport(id);
        if (!result) return err('NOT_FOUND', 'Report not found', 404, requestId);

        const storageResult = await deleteReportFile(result.storagePath);
        if (!storageResult.ok) {
            console.warn(`[reports.DELETE:${requestId}] storage delete failed, orphan: ${result.storagePath}`);
        }
        return NextResponse.json({ success: true, requestId });
    } catch (error) {
        console.error(`[reports.DELETE:${requestId}] failed`, error);
        return err('INTERNAL', 'Failed to delete', 500, requestId);
    }
}
```

- [ ] **Step 2: Smoke test (non-existent id)**

```bash
curl -s -o /tmp/r.json -w "%{http_code}\n" http://localhost:3000/api/reports/00000000-0000-0000-0000-000000000000
cat /tmp/r.json
```

Expected: `404`, body `{ "error": "Report not found", "code": "NOT_FOUND", ... }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/\[id\]/route.ts
git commit -m "feat(api): GET + DELETE single report"
```

---

## Task 12: `GET /api/reports/[id]/download`

**Files:**
- Create: `src/app/api/reports/[id]/download/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/reports/[id]/download/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { getReportStoragePath } from '@/server/reportsRepo';
import { createReportSignedUrl } from '@/lib/reportsStorage';
import type { ReportErrorCode } from '@/types/report';

export const runtime = 'nodejs';

const RATE_MAX = readPositiveIntEnv('REPORT_DOWNLOAD_RATE_LIMIT_MAX', 60);
const RATE_WINDOW_MS = readPositiveIntEnv('REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

const err = (code: ReportErrorCode, message: string, status: number, requestId: string) =>
    NextResponse.json({ error: message, code, requestId }, { status });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const requestId = randomUUID();
    const { id } = await params;
    try {
        const rate = checkRateLimit({
            scope: 'reports-download',
            key: getRateLimitKey(request),
            limit: RATE_MAX,
            windowMs: RATE_WINDOW_MS,
        });
        if (!rate.allowed) {
            return NextResponse.json(
                { error: 'Too many downloads', code: 'RATE_LIMITED', requestId },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) } },
            );
        }

        const storagePath = await getReportStoragePath(id);
        if (!storagePath) return err('NOT_FOUND', 'Report not found', 404, requestId);

        const signed = await createReportSignedUrl(storagePath);
        if ('error' in signed) {
            return err('STORAGE_ERROR', 'Could not create download URL', 500, requestId);
        }
        return NextResponse.json({ url: signed.url, requestId });
    } catch (error) {
        console.error(`[reports.download:${requestId}] failed`, error);
        return err('INTERNAL', 'Download failed', 500, requestId);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/reports/\[id\]/download/route.ts
git commit -m "feat(api): GET signed-URL for report download"
```

---

## Task 13: `useDraggable` hook (TDD)

**Files:**
- Create: `src/hooks/useDraggable.test.tsx`
- Create: `src/hooks/useDraggable.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useDraggable.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useDraggable } from './useDraggable';

const makeRefs = () => {
    const element = document.createElement('div');
    const handle = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
        value: () => ({ left: 100, top: 100, width: 200, height: 100, right: 300, bottom: 200, x: 100, y: 100, toJSON: () => '' }),
    });
    document.body.append(handle, element);
    return { element, handle };
};

describe('useDraggable', () => {
    it('calls onChange with new position on pointer drag', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();
        renderHook(() => {
            const elRef = useRef(element);
            const handleRef = useRef(handle);
            useDraggable({ elementRef: elRef, handleRef, onChange });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 150, pointerId: 1, button: 0, bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 180, pointerId: 1, bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 180, pointerId: 1, bubbles: true }));
        });

        expect(onChange).toHaveBeenCalled();
        const last = onChange.mock.calls.at(-1)![0];
        expect(last.x).toBe(150); // 100 + (200-150)
        expect(last.y).toBe(130); // 100 + (180-150)
    });

    it('ignores right-click (button !== 0)', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();
        renderHook(() => {
            const elRef = useRef(element);
            const handleRef = useRef(handle);
            useDraggable({ elementRef: elRef, handleRef, onChange });
        });
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, button: 2, bubbles: true }));
        });
        expect(onChange).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Install testing-library if missing**

```bash
npm install --save-dev @testing-library/react @testing-library/dom jsdom
```

Check `vitest.config.ts` — if it doesn't already use `environment: 'jsdom'`, set it.

- [ ] **Step 3: Run test, verify it fails**

```bash
npx vitest run src/hooks/useDraggable.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/hooks/useDraggable.ts`:

```ts
import { useEffect, type RefObject } from 'react';

export type Position = { x: number; y: number };

export const useDraggable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    onChange: (pos: Position) => void;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, onChange, enabled = true } = params;

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let startPointerX = 0;
        let startPointerY = 0;
        let startElX = 0;
        let startElY = 0;

        const onDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const el = elementRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            startPointerX = event.clientX;
            startPointerY = event.clientY;
            startElX = rect.left;
            startElY = rect.top;
            active = true;
            handle.setPointerCapture?.(event.pointerId);
        };

        const onMove = (event: PointerEvent) => {
            if (!active) return;
            const dx = event.clientX - startPointerX;
            const dy = event.clientY - startPointerY;
            onChange({ x: startElX + dx, y: startElY + dy });
        };

        const onUp = () => { active = false; };

        handle.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            handle.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [elementRef, handleRef, onChange, enabled]);
};
```

- [ ] **Step 5: Run test, verify pass**

```bash
npx vitest run src/hooks/useDraggable.test.tsx
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDraggable.ts src/hooks/useDraggable.test.tsx vitest.config.ts package.json package-lock.json
git commit -m "feat(hooks): useDraggable for pointer-based drag"
```

---

## Task 14: `useResizable` hook (TDD)

**Files:**
- Create: `src/hooks/useResizable.test.tsx`
- Create: `src/hooks/useResizable.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useResizable.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useResizable } from './useResizable';

describe('useResizable', () => {
    it('changes size on drag of resize handle', () => {
        const element = document.createElement('div');
        const handle = document.createElement('div');
        Object.defineProperty(element, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => '' }),
        });
        document.body.append(element, handle);
        const onChange = vi.fn();

        renderHook(() => {
            const elRef = useRef(element);
            const hRef = useRef(handle);
            useResizable({ elementRef: elRef, handleRef: hRef, onChange, min: { width: 100, height: 80 }, max: { width: 9999, height: 9999 } });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 380, pointerId: 1, bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, clientY: 380, pointerId: 1, bubbles: true }));
        });

        const last = onChange.mock.calls.at(-1)![0];
        expect(last.width).toBe(500);
        expect(last.height).toBe(380);
    });

    it('clamps to min', () => {
        const element = document.createElement('div');
        const handle = document.createElement('div');
        Object.defineProperty(element, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => '' }),
        });
        document.body.append(element, handle);
        const onChange = vi.fn();

        renderHook(() => {
            const elRef = useRef(element);
            const hRef = useRef(handle);
            useResizable({ elementRef: elRef, handleRef: hRef, onChange, min: { width: 320, height: 240 }, max: { width: 9999, height: 9999 } });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }));
        });
        const last = onChange.mock.calls.at(-1)![0];
        expect(last.width).toBe(320);
        expect(last.height).toBe(240);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/hooks/useResizable.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/useResizable.ts`:

```ts
import { useEffect, type RefObject } from 'react';

export type Size = { width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const useResizable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    onChange: (size: Size) => void;
    min: Size;
    max: Size;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, onChange, min, max, enabled = true } = params;

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let startX = 0;
        let startY = 0;
        let startW = 0;
        let startH = 0;

        const onDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const el = elementRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            startX = event.clientX;
            startY = event.clientY;
            startW = rect.width;
            startH = rect.height;
            active = true;
            handle.setPointerCapture?.(event.pointerId);
        };

        const onMove = (event: PointerEvent) => {
            if (!active) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            onChange({
                width: clamp(startW + dx, min.width, max.width),
                height: clamp(startH + dy, min.height, max.height),
            });
        };

        const onUp = () => { active = false; };

        handle.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            handle.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [elementRef, handleRef, onChange, min.width, min.height, max.width, max.height, enabled]);
};
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/hooks/useResizable.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useResizable.ts src/hooks/useResizable.test.tsx
git commit -m "feat(hooks): useResizable south-east handle with clamps"
```

---

## Task 15: `usePersistedWindow` hook (TDD)

**Files:**
- Create: `src/hooks/usePersistedWindow.test.tsx`
- Create: `src/hooks/usePersistedWindow.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/usePersistedWindow.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedWindow } from './usePersistedWindow';

const DEFAULTS = { x: 100, y: 100, width: 720, height: 560 };

describe('usePersistedWindow', () => {
    beforeEach(() => {
        localStorage.clear();
        // jsdom default window is 1024x768
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    });

    it('returns defaults when localStorage empty', () => {
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state).toEqual(DEFAULTS);
    });

    it('loads from localStorage', () => {
        localStorage.setItem('test-key', JSON.stringify({ x: 200, y: 200, width: 800, height: 600 }));
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state).toEqual({ x: 200, y: 200, width: 800, height: 600 });
    });

    it('clamps oversized stored state to viewport', () => {
        localStorage.setItem('test-key', JSON.stringify({ x: -50, y: -50, width: 9999, height: 9999 }));
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state.x).toBeGreaterThanOrEqual(0);
        expect(result.current.state.y).toBeGreaterThanOrEqual(0);
        expect(result.current.state.width).toBeLessThanOrEqual(1024 - 40);
        expect(result.current.state.height).toBeLessThanOrEqual(768 - 40);
    });

    it('persists on setPosition + setSize', () => {
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        act(() => { result.current.setPosition({ x: 50, y: 60 }); });
        act(() => { result.current.setSize({ width: 800, height: 600 }); });
        const stored = JSON.parse(localStorage.getItem('test-key')!);
        expect(stored).toEqual({ x: 50, y: 60, width: 800, height: 600 });
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/hooks/usePersistedWindow.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/usePersistedWindow.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

export type WindowState = { x: number; y: number; width: number; height: number };

const VIEWPORT_MARGIN = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const clampToViewport = (s: WindowState): WindowState => {
    const maxW = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1024) - VIEWPORT_MARGIN);
    const maxH = Math.max(240, (typeof window !== 'undefined' ? window.innerHeight : 768) - VIEWPORT_MARGIN);
    const width = clamp(s.width, 320, maxW);
    const height = clamp(s.height, 240, maxH);
    const maxX = Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1024) - width);
    const maxY = Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 768) - height);
    return { width, height, x: clamp(s.x, 0, maxX), y: clamp(s.y, 0, maxY) };
};

export const usePersistedWindow = (key: string, defaults: WindowState) => {
    const [state, setState] = useState<WindowState>(() => {
        if (typeof window === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return clampToViewport(defaults);
            const parsed = JSON.parse(raw) as Partial<WindowState>;
            return clampToViewport({
                x: typeof parsed.x === 'number' ? parsed.x : defaults.x,
                y: typeof parsed.y === 'number' ? parsed.y : defaults.y,
                width: typeof parsed.width === 'number' ? parsed.width : defaults.width,
                height: typeof parsed.height === 'number' ? parsed.height : defaults.height,
            });
        } catch {
            return clampToViewport(defaults);
        }
    });

    useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* quota */ }
    }, [key, state]);

    useEffect(() => {
        const onResize = () => setState((prev) => clampToViewport(prev));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const setPosition = useCallback((pos: { x: number; y: number }) => {
        setState((prev) => clampToViewport({ ...prev, x: pos.x, y: pos.y }));
    }, []);

    const setSize = useCallback((size: { width: number; height: number }) => {
        setState((prev) => clampToViewport({ ...prev, width: size.width, height: size.height }));
    }, []);

    return { state, setPosition, setSize };
};
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/hooks/usePersistedWindow.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePersistedWindow.ts src/hooks/usePersistedWindow.test.tsx
git commit -m "feat(hooks): usePersistedWindow with viewport clamp + storage"
```

---

## Task 16: `<ReportPopup>` component

**Files:**
- Create: `src/components/ReportPopup.tsx`
- Create: `src/components/ReportPopup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReportPopup.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportPopup from './ReportPopup';
import type { Report } from '@/types/report';

const REPORT: Report = {
    id: 'r1',
    month: '2026-05',
    reportDate: '2026-05-19',
    sprintNumber: 77,
    title: 'Week 21 · 18/05 - 22/05',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    originalFilename: 'sample.docx',
    fileSizeBytes: 1234,
    uploadedBy: 'tri',
    createdAt: '2026-05-22T10:00:00Z',
    updatedAt: '2026-05-22T10:00:00Z',
    htmlContent: '<h1>Hello</h1><p>Body <strong>bold</strong></p>',
};

describe('<ReportPopup>', () => {
    it('renders the sanitized HTML', () => {
        render(<ReportPopup report={REPORT} onClose={() => {}} onDownload={() => {}} />);
        expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy();
        expect(screen.getByText('bold')).toBeTruthy();
    });

    it('fires onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(<ReportPopup report={REPORT} onClose={onClose} onDownload={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('fires onDownload when download button clicked', () => {
        const onDownload = vi.fn();
        render(<ReportPopup report={REPORT} onClose={() => {}} onDownload={onDownload} />);
        fireEvent.click(screen.getByRole('button', { name: /download/i }));
        expect(onDownload).toHaveBeenCalled();
    });

    it('fires onClose on Escape key', () => {
        const onClose = vi.fn();
        render(<ReportPopup report={REPORT} onClose={onClose} onDownload={() => {}} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/components/ReportPopup.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ReportPopup.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { X, Download, GripHorizontal } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useResizable } from '@/hooks/useResizable';
import { usePersistedWindow } from '@/hooks/usePersistedWindow';
import type { Report } from '@/types/report';

const STORAGE_KEY = 'report-popup-window';
const computeCenteredDefaults = () => {
    if (typeof window === 'undefined') return { x: 120, y: 80, width: 720, height: 560 };
    const width = Math.min(720, window.innerWidth - 80);
    const height = Math.min(560, window.innerHeight - 80);
    return {
        x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
        width,
        height,
    };
};
const DEFAULTS = computeCenteredDefaults();
const MIN = { width: 320, height: 240 };

interface Props {
    report: Report;
    onClose: () => void;
    onDownload: () => void;
}

export default function ReportPopup({ report, onClose, onDownload }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const handleRef = useRef<HTMLDivElement | null>(null);
    const resizeRef = useRef<HTMLDivElement | null>(null);

    const { state, setPosition, setSize } = usePersistedWindow(STORAGE_KEY, DEFAULTS);

    useDraggable({ elementRef: containerRef, handleRef, onChange: setPosition });
    useResizable({
        elementRef: containerRef,
        handleRef: resizeRef,
        onChange: setSize,
        min: MIN,
        max: { width: 9999, height: 9999 },
    });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-label={report.title}
            className="fixed bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col overflow-hidden"
            style={{
                left: state.x,
                top: state.y,
                width: state.width,
                height: state.height,
                zIndex: 60,
            }}
        >
            <div
                ref={handleRef}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none"
            >
                <GripHorizontal className="w-4 h-4 text-gray-400" aria-hidden />
                <div className="flex-1 truncate text-sm font-semibold text-gray-800">{report.title}</div>
                <button
                    onClick={onDownload}
                    aria-label="Download original .docx"
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                >
                    <Download className="w-4 h-4" />
                </button>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div
                className="flex-1 overflow-auto p-4 report-prose text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: report.htmlContent }}
            />
            <div
                ref={resizeRef}
                role="separator"
                aria-label="Resize"
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                style={{
                    background:
                        'linear-gradient(135deg, transparent 50%, #94a3b8 50%, #94a3b8 60%, transparent 60%, transparent 70%, #94a3b8 70%, #94a3b8 80%, transparent 80%)',
                }}
            />
        </div>
    );
}
```

- [ ] **Step 4: Add `.report-prose` styles**

Add to `src/app/globals.css`:

```css
.report-prose h1 { font-size: 1.25rem; font-weight: 700; margin: 0.75rem 0 0.5rem; }
.report-prose h2 { font-size: 1.125rem; font-weight: 700; margin: 0.75rem 0 0.5rem; }
.report-prose h3 { font-size: 1rem; font-weight: 600; margin: 0.5rem 0; }
.report-prose p { margin: 0.5rem 0; }
.report-prose ul { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
.report-prose ol { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
.report-prose li { margin: 0.125rem 0; }
.report-prose strong { font-weight: 700; }
.report-prose em { font-style: italic; }
.report-prose table { border-collapse: collapse; margin: 0.5rem 0; }
.report-prose th, .report-prose td { border: 1px solid #e5e7eb; padding: 0.25rem 0.5rem; }
.report-prose th { background: #f9fafb; font-weight: 600; }
.report-prose a { color: #2563eb; text-decoration: underline; }
```

- [ ] **Step 5: Run test, verify pass**

```bash
npx vitest run src/components/ReportPopup.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReportPopup.tsx src/components/ReportPopup.test.tsx src/app/globals.css
git commit -m "feat(ui): ReportPopup floating window with drag/resize/esc"
```

---

## Task 17: `<UploadReportDialog>` component

**Files:**
- Create: `src/components/UploadReportDialog.tsx`

A modal dialog that lets the editor pick a file, see a metadata preview (parsed client-side using a lightweight DataView preview — actually we let the backend parse and re-show), and confirm. To keep this lean we parse on submit only and surface the parsed metadata as a confirmation toast on success; full preview-before-save is YAGNI here.

- [ ] **Step 1: Implement**

Create `src/components/UploadReportDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import type { ReportListItem, ReportErrorBody } from '@/types/report';

interface Props {
    onClose: () => void;
    onUploaded: (report: ReportListItem) => void;
    onError: (message: string) => void;
}

export default function UploadReportDialog({ onClose, onUploaded, onError }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!file) return;
        setSubmitting(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/reports', { method: 'POST', body: form });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
                onError(body.error || `Upload failed (${res.status})`);
                return;
            }
            const data = (await res.json()) as { report: ReportListItem };
            onUploaded(data.report);
            onClose();
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div className="font-semibold text-gray-800">Upload weekly report</div>
                    <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 space-y-3">
                    <label className="block text-sm">
                        <span className="text-gray-600">.docx file</span>
                        <input
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="block w-full mt-1 text-sm"
                        />
                    </label>
                    {file && (
                        <div className="text-xs text-gray-500">
                            {file.name} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm rounded hover:bg-gray-100">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!file || submitting}
                        className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:bg-gray-300 flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/UploadReportDialog.tsx
git commit -m "feat(ui): UploadReportDialog for editor upload"
```

---

## Task 18: `<ReportsPanel>` component

**Files:**
- Create: `src/components/ReportsPanel.tsx`
- Create: `src/components/ReportsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReportsPanel.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsPanel from './ReportsPanel';

const fakeFetch = (urlMap: Record<string, unknown>) =>
    vi.fn(async (url: string) => {
        const key = Object.keys(urlMap).find((k) => url.startsWith(k));
        if (!key) return new Response('Not found', { status: 404 });
        return new Response(JSON.stringify(urlMap[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

describe('<ReportsPanel>', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('renders months and lists reports for the selected month', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [{
                id: 'r1', month: '2026-05', reportDate: '2026-05-19', sprintNumber: 77,
                title: 'Week 21', weekLabel: 'Week 21', dateRange: '18/05 - 22/05',
                originalFilename: 's.docx', fileSizeBytes: 0, uploadedBy: 'tri',
                createdAt: '', updatedAt: '',
            }] },
        }) as unknown as typeof fetch;

        render(<ReportsPanel canEdit={false} onSelect={() => {}} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText('Week 21')).toBeTruthy());
    });

    it('hides upload button when canEdit is false', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [] },
        }) as unknown as typeof fetch;
        render(<ReportsPanel canEdit={false} onSelect={() => {}} onClose={() => {}} />);
        await waitFor(() => expect(screen.queryByRole('button', { name: /upload/i })).toBeNull());
    });

    it('calls onSelect with id when row clicked', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [{
                id: 'r1', month: '2026-05', reportDate: '2026-05-19', sprintNumber: 77,
                title: 'Week 21', weekLabel: 'Week 21', dateRange: '18/05 - 22/05',
                originalFilename: 's.docx', fileSizeBytes: 0, uploadedBy: 'tri',
                createdAt: '', updatedAt: '',
            }] },
        }) as unknown as typeof fetch;
        const onSelect = vi.fn();
        render(<ReportsPanel canEdit={false} onSelect={onSelect} onClose={() => {}} />);
        await waitFor(() => screen.getByText('Week 21'));
        fireEvent.click(screen.getByText('Week 21'));
        expect(onSelect).toHaveBeenCalledWith('r1');
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/components/ReportsPanel.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/ReportsPanel.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Upload, Download, Trash2, Loader2, FileText } from 'lucide-react';
import type { ReportListItem } from '@/types/report';
import UploadReportDialog from './UploadReportDialog';

interface Props {
    canEdit: boolean;
    onSelect: (reportId: string) => void;
    onClose: () => void;
    onToast?: (message: string, kind?: 'success' | 'error') => void;
}

const todayMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ReportsPanel({ canEdit, onSelect, onClose, onToast }: Props) {
    const [months, setMonths] = useState<string[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string>(todayMonth());
    const [reports, setReports] = useState<ReportListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);

    const loadMonths = useCallback(async () => {
        try {
            const res = await fetch('/api/reports/months');
            const data = (await res.json()) as { months: string[] };
            setMonths(data.months);
            if (data.months.length && !data.months.includes(selectedMonth)) {
                setSelectedMonth(data.months[0]);
            }
        } catch (error) {
            onToast?.('Failed to load months', 'error');
        }
    }, [onToast, selectedMonth]);

    const loadReports = useCallback(async (month: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports?month=${encodeURIComponent(month)}`);
            const data = (await res.json()) as { reports: ReportListItem[] };
            setReports(data.reports);
        } catch (error) {
            onToast?.('Failed to load reports', 'error');
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => { void loadMonths(); }, [loadMonths]);
    useEffect(() => { void loadReports(selectedMonth); }, [loadReports, selectedMonth]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this report?')) return;
        try {
            const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                onToast?.(body.error || 'Delete failed', 'error');
                return;
            }
            onToast?.('Report deleted', 'success');
            await loadMonths();
            await loadReports(selectedMonth);
        } catch (error) {
            onToast?.('Delete failed', 'error');
        }
    };

    const handleDownload = async (id: string) => {
        try {
            const res = await fetch(`/api/reports/${id}/download`);
            if (!res.ok) {
                onToast?.('Download failed', 'error');
                return;
            }
            const data = (await res.json()) as { url: string };
            window.open(data.url, '_blank');
        } catch (error) {
            onToast?.('Download failed', 'error');
        }
    };

    return (
        <aside className="fixed top-0 right-0 h-full w-[360px] bg-white border-l border-gray-200 shadow-lg flex flex-col z-40">
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2 text-gray-800 font-semibold">
                    <FileText className="w-4 h-4" /> Reports
                </div>
                <button onClick={onClose} aria-label="Close panel" className="p-1 rounded hover:bg-gray-100">
                    <X className="w-4 h-4" />
                </button>
            </header>

            <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                <label className="block text-xs text-gray-500">Month</label>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                    {months.length === 0 && <option value={selectedMonth}>{selectedMonth}</option>}
                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            {canEdit && (
                <div className="px-4 py-3 border-b border-gray-200">
                    <button
                        onClick={() => setShowUpload(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        <Upload className="w-4 h-4" /> Upload .docx
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-auto">
                {loading && (
                    <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                )}
                {!loading && reports.length === 0 && (
                    <div className="p-4 text-sm text-gray-500">Chưa có report nào trong tháng này.</div>
                )}
                {!loading && reports.map((r) => (
                    <div key={r.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <button
                            onClick={() => onSelect(r.id)}
                            className="block w-full text-left"
                        >
                            <div className="text-sm font-medium text-gray-800">{r.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {r.sprintNumber ? `Sprint ${r.sprintNumber} · ` : ''}
                                {r.reportDate}
                                {r.uploadedBy ? ` · ${r.uploadedBy}` : ''}
                            </div>
                        </button>
                        <div className="flex gap-3 mt-2 text-xs">
                            <button onClick={() => handleDownload(r.id)} className="text-blue-600 hover:underline flex items-center gap-1">
                                <Download className="w-3 h-3" /> Download
                            </button>
                            {canEdit && (
                                <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline flex items-center gap-1">
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showUpload && (
                <UploadReportDialog
                    onClose={() => setShowUpload(false)}
                    onUploaded={() => { void loadMonths(); void loadReports(selectedMonth); onToast?.('Report uploaded', 'success'); }}
                    onError={(msg) => onToast?.(msg, 'error')}
                />
            )}
        </aside>
    );
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/components/ReportsPanel.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportsPanel.tsx src/components/ReportsPanel.test.tsx
git commit -m "feat(ui): ReportsPanel with month picker + list + delete"
```

---

## Task 19: Toolbar button

**Files:**
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: Add the props**

In `src/components/Toolbar.tsx`, locate the `ToolbarProps` interface and add **after** the existing `isMilestonesPopupOpen?: boolean;` line:

```ts
    onOpenReportsPanel?: () => void;
    isReportsPanelOpen?: boolean;
```

- [ ] **Step 2: Add the icon import**

In the same file, find the existing import from `lucide-react` and add `FileText` to the list:

```ts
import {
    Download, FileJson, Loader2, Flag, Check,
    Pencil, Settings, X, ChevronRight, ChevronDown, Upload, Filter, Unlock, ArrowLeft,
    ChevronsUp, ChevronsDown, FileText,
} from 'lucide-react';
```

- [ ] **Step 3: Add the button**

Find the Filter button JSX (search for `onOpenFilterPopup`) and add a sibling button right after it:

```tsx
{onOpenReportsPanel && (
    <button
        onClick={onOpenReportsPanel}
        aria-label="Open reports panel"
        title="Reports"
        className={`p-2 rounded ${isReportsPanelOpen ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}
    >
        <FileText className="w-4 h-4" />
    </button>
)}
```

Match the surrounding indentation and class style — copy from the Filter button if needed.

- [ ] **Step 4: Destructure the props**

In the component signature (find `export default function Toolbar(`), add the new props to the destructure list. The component currently looks roughly like:
```tsx
export default function Toolbar({ ..., onOpenFilterPopup, isFilterPopupOpen, ... }: ToolbarProps) {
```
Add `onOpenReportsPanel, isReportsPanelOpen,` to that list.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors mention required props, mark them optional in the interface (`?:`).

- [ ] **Step 6: Commit**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat(toolbar): Reports button"
```

---

## Task 20: Wire state in roadmap page

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

- [ ] **Step 1: Inspect the file first**

```bash
grep -n "isFilterPopupOpen\|isMilestonesPopupOpen\|Toolbar" src/app/roadmap/[id]/page.tsx
```

Note the exact lines where existing popup state and the `<Toolbar />` element are defined.

- [ ] **Step 2: Add state**

Near the other `useState` declarations for popups (e.g. `isFilterPopupOpen`), add:

```tsx
const [isReportsPanelOpen, setIsReportsPanelOpen] = useState(false);
const [activeReportId, setActiveReportId] = useState<string | null>(null);
const [activeReport, setActiveReport] = useState<import('@/types/report').Report | null>(null);
```

- [ ] **Step 3: Fetch report when activeReportId changes**

Add this `useEffect` near the others:

```tsx
useEffect(() => {
    if (!activeReportId) { setActiveReport(null); return; }
    let cancelled = false;
    (async () => {
        const res = await fetch(`/api/reports/${activeReportId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { report: import('@/types/report').Report };
        if (!cancelled) setActiveReport(data.report);
    })();
    return () => { cancelled = true; };
}, [activeReportId]);
```

- [ ] **Step 4: Pass props to Toolbar**

Find the `<Toolbar ... />` element and add:

```tsx
onOpenReportsPanel={() => setIsReportsPanelOpen((prev) => !prev)}
isReportsPanelOpen={isReportsPanelOpen}
```

- [ ] **Step 5: Render the panel + popup**

Below the existing popups (alongside `<FilterPopup>` etc.) add:

```tsx
{isReportsPanelOpen && (
    <ReportsPanel
        canEdit={canEdit}
        onSelect={setActiveReportId}
        onClose={() => setIsReportsPanelOpen(false)}
        onToast={(message, kind) => showToast(message, kind === 'error' ? 'error' : 'success')}
    />
)}
{activeReport && (
    <ReportPopup
        report={activeReport}
        onClose={() => setActiveReportId(null)}
        onDownload={async () => {
            const res = await fetch(`/api/reports/${activeReport.id}/download`);
            if (!res.ok) return;
            const data = (await res.json()) as { url: string };
            window.open(data.url, '_blank');
        }}
    />
)}
```

Adjust `showToast` to whatever helper the file already uses for toasts. If none exists, omit `onToast`.

- [ ] **Step 6: Add imports**

At the top of the file, add:

```tsx
import ReportsPanel from '@/components/ReportsPanel';
import ReportPopup from '@/components/ReportPopup';
```

- [ ] **Step 7: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/app/roadmap/\[id\]/page.tsx
git commit -m "feat(page): wire reports panel + popup into roadmap page"
```

---

## Task 21: README env vars

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add report env vars to the Production Upload Checklist**

In `README.md`, find the "Production Upload Checklist" section. After the existing image rate-limit bullet group, add:

```markdown
6. Configure report upload behavior:
- `REPORT_UPLOAD_MAX_MB` (default 10)
- `REPORT_STORAGE_BUCKET` (default `reports`)
7. Configure report API rate limits:
- `REPORT_UPLOAD_RATE_LIMIT_MAX` / `REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS`
- `REPORT_DELETE_RATE_LIMIT_MAX` / `REPORT_DELETE_RATE_LIMIT_WINDOW_MS`
- `REPORT_DOWNLOAD_RATE_LIMIT_MAX` / `REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS`
8. Verify editor-only access for reports:
- `/api/reports` (POST) and `/api/reports/[id]` (DELETE) return `401` without editor session.
9. Smoke-test reports in production/staging:
- Upload valid `.docx` → success
- Upload `.pdf` or oversize → `400`
- Burst uploads above limit → `429`
- Delete a report → row + Storage object both removed
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document report env vars + smoke checks"
```

---

## Task 22: Full integration smoke (manual)

This is a manual run-through. Document the result in a brief follow-up commit if anything needs adjusting.

- [ ] **Step 1: Start fresh dev server**

```bash
npm run build
npm run dev
```

- [ ] **Step 2: Verify GET endpoints when DB empty**

```bash
curl -s http://localhost:3000/api/reports/months
curl -s "http://localhost:3000/api/reports?month=2026-05"
```

Expected: `{ "months": ["2026-05"] }` and `{ "reports": [] }`.

- [ ] **Step 3: Open the UI, log in as editor**

Visit `http://localhost:3000`. Open a roadmap. Log in as editor (the existing `EDITOR_PASSWORD` flow). Confirm the new "Reports" button appears in the Toolbar.

- [ ] **Step 4: Upload the Week 21 sample**

Click Reports → Upload .docx → pick `/Users/nguyenminhtri/Downloads/SW _ Week 21 Report _ 1805 -2205.docx` → Upload. Verify:
- A toast confirms success.
- The month picker shows `2026-05` selected.
- A row appears titled "Week 21 · 18/05 - 22/05" with Sprint 77.

- [ ] **Step 5: Open the popup**

Click the row. Verify:
- Popup appears centered (first time) with formatted content.
- Drag the header — popup follows the cursor.
- Drag the south-east handle — popup resizes.
- Refresh the page, reopen, confirm position/size are preserved.
- Press Escape — popup closes.

- [ ] **Step 6: Download original**

Click the Download button in the popup header. The browser should open/save the `.docx`.

- [ ] **Step 7: Bad inputs**

- Try uploading a `.pdf` → toast with `INVALID_FILE_TYPE` style message.
- Try uploading an >10 MB file → toast with `FILE_TOO_LARGE` style message.
- Burst 11 uploads in under a minute → 11th returns `429` with `RATE_LIMITED` toast.

- [ ] **Step 8: Delete**

Click Delete on a row → confirm → row disappears. Re-check `/api/reports/months` — if that was the last report in a month, the month drops off.

- [ ] **Step 9: Non-editor viewing**

Log out of editor. Confirm:
- "Reports" button still visible (anyone can browse).
- Upload button hidden.
- Delete buttons hidden.
- Clicking a row still opens the popup.

- [ ] **Step 10: Run the full test suite**

```bash
npm test
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 11: Commit any fixes**

If any step revealed a bug, fix it inline with a commit per fix. Reference this task in the commit message body.

---

## Definition of Done

- ✅ `npm test`, `npm run lint`, `npm run build` all pass
- ✅ Manual smoke checklist in Task 22 completed end-to-end
- ✅ All new files committed in sequence
- ✅ `README.md` updated with new env vars
- ✅ Spec at `docs/superpowers/specs/2026-05-24-weekly-report-popup-design.md` matches what was built (no drift)
