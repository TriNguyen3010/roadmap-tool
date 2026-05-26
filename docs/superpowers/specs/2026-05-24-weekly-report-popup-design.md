# Weekly Report Popup — Design Spec

**Date:** 2026-05-24
**Status:** Approved, ready for plan
**Author:** Tri Nguyen + Claude

## 1. Goal

Add a "Reports" feature to the roadmap tool so editors can upload weekly status reports (`.docx`) and any viewer can browse them. Reports are grouped by month, listed in chronological + sprint order, and opened in a floating, draggable, resizable popup that persists its window position across reloads.

## 2. Background & Context

The product team produces a weekly Word document (e.g. `SW _ Week 21 Report _ 1805 -2205.docx`) covering:
- Workstream overview (Wallet Health, Web, Houdini, Specify, CCE)
- Current sprint tickets (e.g. `CSA-8338`, `CSA-8341`)
- Product design handoff status
- Deadline notes

Today these files live in shared drives; there is no in-app way to read them next to the roadmap they describe. We want a lightweight document library inside the roadmap tool — not a sync layer with roadmap items (that may come later).

The roadmap-tool stack is Next.js 16, React 19, Supabase (Storage + Postgres), Cloudinary (images only), Vitest, with an editor-only auth pattern already in place (`serverTeamAuth.ts`, `EDITOR_PASSWORD`, `canEdit` prop).

## 3. Requirements Summary

| Area | Decision |
|---|---|
| Purpose | Document library — read past reports, grouped by month |
| Input | Upload `.docx`, server parses to HTML, original kept for download |
| Popup | Drag + Resize, persists position/size, single popup at a time |
| UI entry | Button in `Toolbar` → side panel directory → click report → popup |
| Permissions | Editor-only upload/delete; public read |

### Out of scope (YAGNI)

- Full-text search UI (we will store `raw_text` so it is cheap to add later)
- Editing a report after upload (replace = delete + upload)
- Multi-popup, minimize-to-chip, snap-to-side
- Versioning a report (each upload is a new row)
- Notifications on new report
- Per-team / per-roadmap permission
- Sync between report content (e.g. `CSA-XXXX`) and roadmap items

## 4. Architecture Choice

**Approach: Parse on upload, cache HTML in DB.**

```
Editor uploads .docx
    │
    ▼
POST /api/reports (editor-only, rate-limited)
    │
    ├── Validate (type, size)
    ├── Mammoth: docx → HTML + raw text
    ├── DOMPurify (server): sanitize HTML
    ├── Best-effort metadata extraction (week, date range, sprint, report_date)
    ├── Upload .docx → Supabase Storage (private bucket `reports`)
    └── Insert row → Supabase Postgres `reports` table
                            │
                            ▼
                  Client reads via GET endpoints
                            │
                            ▼
        ReportPopup renders sanitized HTML; download via signed URL
```

**Rejected alternatives:**
- *Parse on every read* — repeated compute, slower reads (~200–500 ms extra per open).
- *Markdown intermediate* — loses complex tables, embedded images, nested styling.

Trade-off accepted: if the parser improves later, we expose a one-off re-parse endpoint that re-runs Mammoth + DOMPurify on the stored `.docx` and updates `html_content`.

## 5. Data Model

### 5.1 Postgres table `reports`

```sql
create table reports (
  id uuid primary key default gen_random_uuid(),

  -- Filtering / sorting
  month text not null,              -- 'YYYY-MM', groups in the panel
  report_date date not null,        -- primary sort key (desc)
  sprint_number int,                -- secondary sort key (desc), nullable

  -- Display
  title text not null,              -- e.g. 'SW - Week 21 Report (18/05 - 22/05)'
  week_label text,                  -- e.g. 'Week 21'
  date_range text,                  -- e.g. '18/05 - 22/05'

  -- Content
  original_filename text not null,
  original_storage_path text not null, -- 'reports/<month>/<uuid>-<safe-filename>.docx'
  html_content text not null,          -- sanitized output from Mammoth + DOMPurify
  raw_text text,                       -- plain text fallback for future search

  -- Audit
  uploaded_by text,
  file_size_bytes int not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index reports_month_idx
  on reports (month, report_date desc, sprint_number desc);
```

Migration filename: `20260524120000_create_reports_table.sql` (follows existing date-prefix convention).

### 5.2 Supabase Storage bucket `reports`

- **Private** bucket; no public read.
- Path: `<month>/<uuid>-<sanitized-filename>.docx`.
- Access only via signed URL minted server-side in `/api/reports/[id]/download`.
- On row delete, the API removes the file from Storage in the same handler (Supabase Storage and Postgres are not transactional together — order is: delete DB row first, then delete Storage object; if Storage delete fails after DB delete succeeds, log + alert and treat as orphan to be swept later).

## 6. API Endpoints (Next.js App Router)

All under `src/app/api/reports/`. Reuse `serverTeamAuth.ts` for editor checks and `rateLimit.ts` for write endpoints.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/reports/months` | Public | Returns distinct `month` values that have at least one report, sorted desc. If the table is empty, returns just `[today's YYYY-MM]` so the picker is never empty |
| `GET` | `/api/reports?month=YYYY-MM` | Public | List rows for that month, sorted `(report_date desc, sprint_number desc nulls last, created_at desc)`. Omits `html_content` to keep payload light |
| `GET` | `/api/reports/[id]` | Public | Returns full row including `html_content` |
| `GET` | `/api/reports/[id]/download` | Public, rate-limited | Returns Supabase signed URL (TTL 60 s) for the `.docx` |
| `POST` | `/api/reports` | Editor-only, rate-limited | Multipart upload; see §7 |
| `DELETE` | `/api/reports/[id]` | Editor-only, rate-limited | Delete row + Storage file |

### Environment variables (new)

| Name | Default | Purpose |
|---|---|---|
| `REPORT_UPLOAD_MAX_MB` | `10` | Reject larger uploads with 400 |
| `REPORT_UPLOAD_RATE_LIMIT_MAX` | `10` | Uploads / window / IP |
| `REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS` | `60000` | Window size |
| `REPORT_DELETE_RATE_LIMIT_MAX` | `20` | Deletes / window / IP |
| `REPORT_DELETE_RATE_LIMIT_WINDOW_MS` | `60000` | Window size |
| `REPORT_DOWNLOAD_RATE_LIMIT_MAX` | `60` | Signed-URL mints / window / IP |
| `REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS` | `60000` | Window size |
| `REPORT_STORAGE_BUCKET` | `reports` | Bucket name |

Document these in `README.md` under the Production Upload Checklist section, alongside the existing image upload variables.

## 7. Upload Flow Details

### 7.1 Validation order

1. `requireEditor(req)` → 401 if not editor.
2. Rate limit check → 429 if exceeded.
3. Parse multipart → 400 `NO_FILE` if missing.
4. Reject if `content-type` is not `application/vnd.openxmlformats-officedocument.wordprocessingml.document` or filename does not end with `.docx` → 400 `INVALID_FILE_TYPE`.
5. Reject if size > `REPORT_UPLOAD_MAX_MB` → 400 `FILE_TOO_LARGE`.
6. Run Mammoth → on throw, 422 `PARSE_FAILED` with Mammoth's message.

### 7.2 Pipeline (pseudocode)

```ts
const buffer = await file.arrayBuffer();

const { value: rawHtml }  = await mammoth.convertToHtml({ buffer });
const { value: rawText }  = await mammoth.extractRawText({ buffer });

const cleanHtml = DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS: [
    'p','h1','h2','h3','h4','strong','em','u','ul','ol','li',
    'table','thead','tbody','tr','td','th','br','a','img','span','div',
  ],
  ALLOWED_ATTR: ['href','src','alt','title','colspan','rowspan'],
});

const meta = parseReportHeader(rawText);
// → { weekLabel?, dateRange?, sprintNumber?, reportDate? }

const safeName = sanitizeFilename(file.name); // strips '..', slashes, control chars
const storagePath = `${meta.month}/${crypto.randomUUID()}-${safeName}`;

await storage.upload(BUCKET, storagePath, buffer, {
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

await db.insert('reports', {
  month: meta.month,
  report_date: meta.reportDate,
  sprint_number: meta.sprintNumber,
  title: meta.title,
  week_label: meta.weekLabel,
  date_range: meta.dateRange,
  original_filename: file.name,
  original_storage_path: storagePath,
  html_content: cleanHtml,
  raw_text: rawText,
  uploaded_by: session.label,
  file_size_bytes: file.size,
});
```

### 7.3 Metadata extraction (best-effort)

`parseReportHeader(rawText)` runs regex against the first ~1 KB of raw text:

| Field | Regex (illustrative) |
|---|---|
| `week_label` | `/Week\s+(\d+)/i` |
| `date_range` | `/(\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2})/` |
| `sprint_number` | `/SPRINT\s+(\d+)/i` |
| `report_date` | `/Ngày:\s*(\d{2})\/(\d{2})\/(\d{4})/` |
| `month` | derived from `report_date`, fallback to today |

The upload dialog shows these as pre-filled, editable fields. The editor confirms or edits before clicking **Save**. If parsing fails entirely, the dialog falls back to manual entry with only `report_date` and `month` required.

### 7.4 Failure modes

- Mammoth throws → 422, no Storage write, no DB row.
- Storage upload fails → 500, no DB row.
- DB insert fails after Storage succeeds → delete the just-uploaded file (best-effort) and return 500.
- DOMPurify produces empty HTML (rare) → still save row with `html_content = '<p>(Không parse được nội dung — tải file gốc để xem.)</p>'` so download still works.

## 8. UI Components

### 8.1 `Toolbar` change

Add to `src/components/Toolbar.tsx`:
- New props: `onOpenReportsPanel: () => void`, `isReportsPanelOpen: boolean`.
- New button using `FileText` icon from `lucide-react`, placed adjacent to Filter/Milestones buttons.
- Active-state styling matches existing pattern when `isReportsPanelOpen` is true.

### 8.2 `<ReportsPanel />` — new, uses existing `SidePanelShell`

```
┌────────────────────────────────────┐
│ Reports                       ✕    │
├────────────────────────────────────┤
│ Month: [ 2026-05  ▼ ]              │
├────────────────────────────────────┤
│ ⇪ Upload .docx     (editor-only)   │
├────────────────────────────────────┤
│ ▸ Week 21 · Sprint 77              │
│   18/05 - 22/05 · uploaded 22/05   │
│   [⇩ download]  [🗑 delete]        │
│                                    │
│ ▸ Week 20 · Sprint 76              │
│   ...                              │
└────────────────────────────────────┘
```

State:
- `selectedMonth: string` (default: today's `YYYY-MM` if it has reports; otherwise the most recent month with reports)
- `months: string[]` from `/api/reports/months`
- `reports: ReportListItem[]` from `/api/reports?month=`
- `isLoading`, `isUploading`

Behavior:
- Upload zone (dropzone + button) is hidden when `canEdit === false`.
- Delete buttons hidden when `canEdit === false`.
- Loading skeleton during fetch; empty state: "Chưa có report nào trong tháng này."
- Clicking a row sets `activeReportId` on the parent page.

### 8.3 `<ReportPopup />` — floating window, new

Layout:

```
┌─ ⠿ drag handle ─ Title ──── ⇩ ✕ ┐
├────────────────────────────────┤
│  <html_content sanitized>      │
│  …                             │
│                          ↘    │
└────────────────────────────────┘
```

Behavior:
- **Drag**: only via header bar. `pointerdown`/`move`/`up`; uses `setPointerCapture` so it works over iframes/other elements.
- **Resize**: south-east corner handle. Min `320 × 240`. Max `viewport - 40px` on each side.
- **Persistence**: `{x, y, width, height}` saved to `localStorage` under key `report-popup-window`. First open → centered, default `720 × 560`.
- **Window-resize clamp**: on `window` resize, if popup is outside or larger than viewport, clamp into visible area without losing user intent (preserve relative position when possible).
- **z-index**: `60` (above side panel `40`, below toast `80`).
- **HTML rendering**: `dangerouslySetInnerHTML={{ __html: report.htmlContent }}` is safe because content was sanitized at write time. Style via scoped CSS (`.report-prose`) covering `h1–h4`, `ul/ol`, `table`, `a`, `img`.
- **Header actions**: title (truncate), Download button (→ `/api/reports/[id]/download`), Close button.
- **Keyboard**: `Esc` closes the popup when focused inside.

Implementation split (each independently testable):
- `useDraggable(ref, { onChange })`
- `useResizable(ref, { min, max, onChange })`
- `usePersistedWindow(key, defaults)` — combines load/save with viewport clamping

### 8.4 Page wiring `src/app/roadmap/[id]/page.tsx`

New state: `isReportsPanelOpen`, `activeReportId`.
- Render `<ReportsPanel>` when open.
- Render `<ReportPopup report={…} />` whenever `activeReportId !== null`, fetching the report on mount.
- Closing the side panel does **not** close the popup; popup is independent. Closing the popup does not affect the panel.

## 9. Cross-cutting Concerns

### Security

- DOMPurify runs server-side (`isomorphic-dompurify`) so the DB never holds untrusted markup.
- Storage bucket is private; all reads to the file go through a signed URL endpoint that respects no auth (matches the "public read" decision) but is rate-limited.
- Filenames are sanitized before being used in paths.

### Performance

- `GET /api/reports?month=` omits `html_content` to keep list payloads under ~10 KB even for large months.
- `html_content` is fetched only on popup open.
- Mammoth runs in the API route (Node runtime, not Edge).

### Accessibility

- All buttons have `aria-label`s.
- Popup `role="dialog"`, focus moves to popup on open, `Esc` to close.
- Drag handle has `aria-grabbed` and is keyboard-focusable; arrow keys move 10 px (nice-to-have, can defer if it bloats P5).

### Error UX

- Reuse existing `Toast.tsx` for upload/delete errors with i18n-friendly strings keyed by error code.
- Upload shows progress (0–100%) and disables form during upload.

## 10. Testing Strategy

**Unit (pure logic):**
- `parseReportHeader.test.ts` — happy path with the Week 21 sample, missing-sprint case, missing-week case, malformed date case.
- `sanitizeReportHtml.test.ts` — strips `<script>`, strips `onerror=`, keeps allowed tags/attrs intact.
- `reportFilename.test.ts` — rejects `../`, strips control chars, preserves Vietnamese diacritics.

**Hook (jsdom):**
- `useDraggable.test.tsx` — simulate pointerdown/move/up, assert position delta.
- `useResizable.test.tsx` — drag handle, assert size respects min/max.
- `usePersistedWindow.test.tsx` — load from localStorage, clamp when viewport smaller than saved size.

**Component (React Testing Library):**
- `ReportsPanel.test.tsx` — month change refetches; click row fires callback; `canEdit=false` hides Upload + Delete.
- `ReportPopup.test.tsx` — renders sanitized HTML; drag updates style; resize updates style; Esc fires close.

**API integration (if pattern exists; otherwise manual smoke):**
- POST without editor session → 401
- POST file > limit → 400 `FILE_TOO_LARGE`
- POST `.pdf` → 400 `INVALID_FILE_TYPE`
- POST happy path → row exists; HTML contains expected content
- DELETE → row + Storage object both gone

## 11. Implementation Phases

| Phase | Scope | Parallel? |
|---|---|---|
| **P1 Foundation** | Migration; Storage bucket setup doc; `Report` type in `src/types/`; install `mammoth` + `isomorphic-dompurify` | Blocks all |
| **P2 Backend** | `parseReportHeader`, `sanitizeReportHtml`, `reportsRepo.ts`, 6 API routes, env wiring, rate limit | Parallel with P3 |
| **P3 Popup primitives** | `useDraggable`, `useResizable`, `usePersistedWindow`, `<ReportPopup />` (standalone, fed mock data) | Parallel with P2 |
| **P4 Panel + wiring** | `<ReportsPanel />`, Toolbar button, page state in `/roadmap/[id]/page.tsx` | After P2 + P3 |
| **P5 Polish** | Toasts for all error codes, empty/loading states, ESC handling, accessibility passes, README updates, manual smoke checklist | After P4 |

## 12. Definition of Done

- ✅ `npm test` passes (all new tests green).
- ✅ `npm run lint` passes.
- ✅ `npm run build` passes.
- ✅ Manual smoke run-through:
  - Upload the Week 21 sample → appears in May list, in correct order.
  - Click row → popup opens with formatted content.
  - Drag popup, resize popup, reload page → position/size restored.
  - Download button returns a working `.docx`.
  - Logout from editor → Upload/Delete buttons hidden; reading still works.
  - Bad inputs (`.pdf`, oversize, no file) → friendly toast, no DB/Storage change.
- ✅ `README.md` lists the new env vars.

## 13. Open Questions

None at spec-approval time. Decisions deferred to "out of scope" above can be picked up as separate specs when needed.
