# Weekly Report — Edit & Save Design Spec

**Date:** 2026-05-25
**Status:** Approved, ready for plan
**Author:** Tri Nguyen + Claude
**Builds on:** `docs/superpowers/specs/2026-05-24-weekly-report-popup-design.md`

## 1. Goal

Allow editors to edit an already-uploaded weekly report — both the HTML content (via a rich-text editor) and the metadata (title, week label, sprint number, date range, report date) — and to replace the original `.docx` file. Save persists changes to Postgres and Supabase Storage; subsequent reads see the updated row.

## 2. Background

The weekly-report-popup shipped (T1–T22 in the prior spec) gives upload, list, popup, drag/resize, signed-URL download. Editors today have no way to fix:

- Mammoth-parsed HTML that lost or mangled formatting from the `.docx`
- Auto-extracted metadata that picked up the wrong date range (the regex matches the first `DD/MM - DD/MM` in the head, which may be in the body instead of the footer)
- The wrong file uploaded by mistake

This spec adds Edit + Save in the floating popup, with three integrated capabilities: rich-text content edit, metadata edit, and `.docx` file replacement.

## 3. Requirements

| # | Requirement |
|---|---|
| R1 | Editors can enter "edit mode" from inside the popup; non-editors do not see the entry point |
| R2 | Edit mode allows changes to: `htmlContent` (rich text), `title`, `weekLabel`, `dateRange`, `sprintNumber`, `reportDate` |
| R3 | Edit mode allows replacing the original `.docx` file; replacement re-parses the document and updates `htmlContent` + `rawText` |
| R4 | All server endpoints reuse the existing trust boundaries: editor-only auth, rate-limited, HTML sanitized server-side, metadata regex-validated |
| R5 | Saves are atomic at the DB layer; storage write before DB on file replace (upload new → update DB → delete old) |
| R6 | If user discards (Cancel) with unsaved changes, confirm before discarding |
| R7 | Popup remains draggable + resizable in edit mode |

### Out of scope (YAGNI)

- Optimistic-concurrency / version-token (last-write-wins)
- Collaborative editing / presence
- Draft persistence across reloads (cancel discards drafts)
- Per-field permissions (one editor role covers everything)
- Undo beyond TipTap's built-in history
- Diff view (before/after)
- Auto-save

## 4. Architecture

**Approach: inline edit mode in the existing popup + 2 new server endpoints.**

```
┌─ ReportPopup ────────────────────────────┐
│ ⠿ Title · Sprint  [✏️ Edit] [⬇] [✕]    │
│ <html_content rendered>                  │
└──────────────────────────────────────────┘
                  │
            click ✏️ Edit (only if canEdit)
                  ▼
┌─ ReportPopup (edit mode) ────────────────┐
│ ⠿ [Title ___]                  [⬇] [✕] │
│   <ReportEditMetaForm/>                  │
│ ├──────────────────────────────────────  │
│ │ <TipTap toolbar>                       │
│ │ <ReportEditBody/> (TipTap editor)      │
│ ├──────────────────────────────────────  │
│ │ [⬆ Replace .docx]  [Cancel]  [Save]  │
└──────────────────────────────────────────┘
```

Two new server endpoints:

- `PATCH /api/reports/[id]` — JSON; partial update of metadata and/or `htmlContent`
- `PUT /api/reports/[id]/file` — multipart; replace original `.docx`, re-parse, atomic storage swap

The existing `DELETE /api/reports/[id]` and `GET /api/reports/[id]` remain unchanged.

## 5. Data Model

No schema changes. The existing `reports` table already has every column the editor will write to. The trigger `reports_set_updated_at` automatically bumps `updated_at` on each update.

## 6. API Endpoints (new)

### 6.1 `PATCH /api/reports/[id]`

**Auth:** `authenticateAdminRequest` → 401 `UNAUTHORIZED`
**Rate limit:** `REPORT_UPLOAD_RATE_LIMIT_MAX` (reused; same write-scope budget as POST/PUT)
**Body:** JSON with any subset of these fields:

```ts
{
    title?: string;
    weekLabel?: string | null;
    dateRange?: string | null;
    sprintNumber?: number | null;
    reportDate?: string;   // YYYY-MM-DD
    month?: string;        // YYYY-MM (if absent but reportDate present, derived server-side)
    htmlContent?: string;  // raw HTML from TipTap; will be sanitized server-side
}
```

**Validation (in order):**
1. UUID guard on `id` → 404 `NOT_FOUND`
2. Auth → 401
3. Rate limit → 429
4. JSON parse → 400 `BAD_REQUEST` if malformed
5. `title` if present must be non-empty after trim → 400
6. `month` if present must match `^\d{4}-\d{2}$` → 400
7. `reportDate` if present must match `^\d{4}-\d{2}-\d{2}$` → 400
8. `sprintNumber` if present must be a finite integer ≥ 0 OR `null` → 400
9. If `reportDate` present and `month` absent: derive `month = reportDate.slice(0,7)`
10. If `htmlContent` present: `sanitized = sanitizeReportHtml(htmlContent)`. If result is just the fallback string and original was non-empty, return 422 `PARSE_FAILED` so editor knows their content was rejected.

**Effect:** `reportsRepo.updateReport(id, partial)` issues `UPDATE ... RETURNING <FULL_COLUMNS>`.

**Response:** 200 `{ report: Report, requestId }`. Or 404 if row not found at update time.

### 6.2 `PUT /api/reports/[id]/file`

**Auth + rate limit:** same as POST (`REPORT_UPLOAD_RATE_LIMIT_*`).
**Body:** multipart with `file` field.

**Flow:**
1. UUID guard → 404
2. Auth → 401
3. Rate limit → 429
4. Fetch existing report (need `month` and `original_storage_path`) → 404 if missing
5. Validate file type and size (same as POST): `.docx` extension + valid MIME, ≤ `REPORT_UPLOAD_MAX_MB`
6. Mammoth `convertToHtml` + `extractRawText` in parallel → 422 `PARSE_FAILED`
7. `sanitizeReportHtml(rawHtml)`
8. Build new storage path: `<existing.month>/<new-uuid>-<safeFilename>`
9. Upload to new path → 500 `STORAGE_ERROR` if upload fails
10. `reportsRepo.updateReport(id, { htmlContent, rawText, originalFilename, originalStoragePath, fileSizeBytes })` — atomic UPDATE
11. On DB success: best-effort `deleteReportFile(old_storage_path)`. Log orphan warning on failure; do NOT fail the request.
12. On DB failure: best-effort delete the just-uploaded new file; return 500 `DB_ERROR`.

**Response:** 200 `{ report: Report, requestId }`.

**Why upload-new-then-delete-old (instead of overwrite-in-place):** Supabase Storage doesn't expose a strongly-atomic replace. Upload-first guarantees the old file remains readable if any later step fails.

## 7. Server library changes

### 7.1 `src/server/reportsRepo.ts`

Add:

```ts
type UpdateReportInput = Partial<{
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

export const updateReport = async (id: string, input: UpdateReportInput): Promise<Report | null> => {
    const row = mapInputToDbColumns(input); // camelCase → snake_case, only present keys
    if (Object.keys(row).length === 0) {
        // Nothing to update — fetch and return as-is (caller may still want fresh data)
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

No changes to `insertReport`, `deleteReport`, `getReportById`, etc.

### 7.2 `src/lib/reportsStorage.ts`

No changes required. The existing `uploadReportFile` + `deleteReportFile` cover replace-by-sequence.

## 8. UI Components

### 8.1 `ReportPopup` — new `mode` state

```tsx
type Mode = 'view' | 'edit';
const [mode, setMode] = useState<Mode>('view');
const [draftMeta, setDraftMeta] = useState<MetaDraft | null>(null);
const [draftHtml, setDraftHtml] = useState<string>('');
const [saving, setSaving] = useState(false);
const [dirty, setDirty] = useState(false);
```

Header in view mode:
- Title (truncated)
- `Edit` button (visible only when `canEdit === true`)
- Download button
- Close button

Header in edit mode:
- Title input (controlled)
- Download button (still works on saved version)
- Close button (Cancel-with-confirm wrapper)

Body in edit mode renders `<ReportEditMetaForm />` above `<ReportEditBody />`.

Footer in edit mode (only shown in edit mode): `[⬆ Replace .docx]` `[Cancel]` `[Save]`.

### 8.2 `ReportEditMetaForm` (new)

```tsx
interface Props {
    value: MetaDraft;
    onChange: (next: MetaDraft) => void;
    errors: MetaErrors;
}
type MetaDraft = {
    title: string;
    weekLabel: string;
    dateRange: string;
    sprintNumber: number | null;
    reportDate: string;
};
```

Layout: 2-column grid. Validates inline via `errors` prop. The parent (`ReportPopup`) owns validation; this component is presentational.

### 8.3 `ReportEditBody` (new)

Wraps TipTap with a small toolbar.

Extensions:
- `StarterKit` (paragraph, heading 1-4, bullet/ordered list, blockquote, hr, code, bold, italic, strike, history)
- `Table` + `TableRow` + `TableCell` + `TableHeader`
- `Link` (allow external `http(s)://`; auto-rel `noopener noreferrer`)
- `Image` (allow `data:image/{png,jpg,jpeg,gif,webp,avif};base64,…` and `http(s)://`)
- `Underline`

Toolbar layout:
```
[H1] [H2] [H3] [• list] [1. list] [B] [I] [U] [—] [🔗] [⊞ Table] · [HTML source]
```

`HTML source` toggle: replaces the rich editor with a `<textarea>` showing the raw sanitized HTML. Editing the source then toggling back re-mounts TipTap with the new content. Useful for fixing odd cases TipTap doesn't expose well.

### 8.4 Save / Cancel flow

```
Save click:
    setSaving(true)
    payload = build diff: only fields that differ from `report` prop
    fetch PATCH /api/reports/[id] with JSON payload
    if 200:
        setReportLocal(data.report)   // overrides the prop locally
        setDirty(false)
        setMode('view')
    else:
        toast(error.message)
    setSaving(false)

Cancel click:
    if dirty: confirm("Hủy thay đổi?") — proceed only on OK
    setMode('view')
    setDirty(false)
```

### 8.5 Replace `.docx` flow

```
Click [⬆ Replace .docx]:
    fileInput.click()
File selected:
    setSaving(true)
    form = new FormData(); form.append('file', file)
    fetch PUT /api/reports/[id]/file
    if 200:
        setReportLocal(data.report)
        sync draftHtml with new report.htmlContent (editor is re-mounted)
        sync draftMeta with new metadata
        setDirty(true)   // user may still want to edit metadata
        toast("File replaced — review and save")
    else:
        toast(error.message)
    setSaving(false)
```

The editor remains in edit mode after a file replace so the user can review and edit metadata that came from the new auto-parse.

### 8.6 ESC key behavior

| Mode | ESC effect |
|---|---|
| view | close popup |
| edit, !dirty | switch to view mode |
| edit, dirty | confirm "Hủy thay đổi?" — if OK switch to view mode |

### 8.7 Drag / resize in edit mode

Drag (header) and resize (8-edge handles) remain functional in edit mode. The TipTap editor area uses `pointerdown.stopPropagation()` to prevent header drag from firing when interacting with the editor.

## 9. Cross-cutting

### 9.1 Sanitization

- Client-side: TipTap output is well-formed HTML. No client sanitization.
- Server-side: `sanitizeReportHtml()` runs on every PATCH and PUT that touches `htmlContent`. This is the canonical trust boundary.

### 9.2 Concurrency

- No version token. Last-write-wins.
- The popup updates `setReportLocal` with the server's response after each save, so the local view is consistent with the DB at save time.
- If two editors concurrently edit different popups, the later save wins; this is acceptable given the small editor team.

### 9.3 Atomicity guarantees

| Operation | Atomicity model | Failure mode |
|---|---|---|
| PATCH metadata only | Single SQL UPDATE | Either fully applied or not at all |
| PATCH htmlContent | Single SQL UPDATE | Either fully applied or not at all |
| PUT replace file | Upload new → DB update → delete old. If DB fails, rollback storage; if storage delete fails, log orphan. | Net effect: file is replaced + DB updated, or both unchanged. Orphan possible (treated as background cleanup). |

### 9.4 Accessibility

- Edit button has `aria-label="Sửa báo cáo"` / English equivalent
- `ReportEditMetaForm` uses `<label>` with `htmlFor`
- Toolbar buttons use `aria-pressed` to reflect active marks (bold etc.)
- Cancel-with-confirm uses native `window.confirm()` for MVP; could upgrade to custom modal later
- TipTap is keyboard-accessible by default; Tab order: title → meta fields → editor → toolbar → footer buttons

### 9.5 Error UX

Toast (existing `addToast`) with message keyed by `ReportErrorCode`:
- `UNAUTHORIZED` → "Bạn không có quyền sửa"
- `BAD_REQUEST` → exact server message
- `RATE_LIMITED` → "Quá nhanh — thử lại sau ${retryAfter}s"
- `PARSE_FAILED` → "Nội dung không parse được"
- `STORAGE_ERROR` / `DB_ERROR` → "Lỗi máy chủ — thử lại"
- network throw → "Lỗi mạng"

### 9.6 Performance

- TipTap deps total ~150 KB gzipped — acceptable for editor-only feature.
- TipTap mounts only when entering edit mode (lazy `import()` inside `ReportEditBody`), so view-only users don't pay the bundle cost.
- PATCH body diffs vs full update: send only changed fields to keep payloads small.

## 10. Testing Strategy

| Layer | Tests |
|---|---|
| **Unit `reportsRepo`** | `updateReport` happy (partial); `updateReport` empty-input no-op (returns current via `getReportById`); throws on bad SQL |
| **Unit metadata validate** | regex helpers reject bad month/date; `sprintNumber` coercion |
| **API `PATCH /[id]`** | 200 happy partial; 200 happy full; 400 bad month/date; 400 empty title; 401 non-editor; 404 missing; 422 sanitize produces empty when input non-empty |
| **API `PUT /[id]/file`** | 200 happy (old storage file actually deleted via mock); 400 invalid type; 401 non-editor; 500 DB rollback deletes new file |
| **Component `ReportEditMetaForm`** | Field changes propagate; sprint number coerces from string→number; error rendering |
| **Component `ReportEditBody`** | Renders initial HTML; toolbar Bold triggers `<strong>`; HTML source toggle round-trips content |
| **Component `ReportPopup` (edit-mode wiring)** | Click Edit enters edit; Save calls PATCH with only-changed fields; Cancel dirty shows confirm; replace-file calls PUT and stays in edit; canEdit=false hides Edit button |

**Test fixtures:** A small sample report payload reusable across tests, including HTML with `<strong>`, `<ul>`, `<table>`, and a tiny PNG `data:` URI to verify image preservation.

## 11. Implementation phases

| Phase | Scope | Parallel? |
|---|---|---|
| **P1 Foundation** | Install TipTap deps; extend `Report` types (no schema change); update `reportsRepo` with `updateReport` | Blocks |
| **P2 Backend** | `PATCH` route, `PUT /file` route, unit tests, integration smoke | Parallel with P3 |
| **P3 Editor primitives** | `ReportEditMetaForm`, `ReportEditBody` (TipTap mount + toolbar), unit tests | Parallel with P2 |
| **P4 Popup integration** | `ReportPopup` mode state, save/cancel flow, file-replace flow, ESC handling | After P2 + P3 |
| **P5 Polish** | i18n strings, toast error mapping, README env note (no new env), spec smoke checklist update | After P4 |

## 12. Definition of Done

- `npm test`, `npx tsc --noEmit`, `npm run lint` all clean (or only pre-existing items)
- Editor can: open popup → Edit → change title/sprint/dates/html → Save → see changes in panel list immediately
- Editor can: in edit mode → Replace .docx → new content renders, metadata auto-fills, can edit further → Save
- Non-editor: no Edit button visible; PATCH/PUT return 401 with editor cookie cleared
- Bad inputs return 4xx with toast, never crash UI
- Pre-existing tests (140) still pass; new tests increment the count

## 13. Open Questions

None at spec approval time. Items in §3 "Out of scope" can become separate specs when needed.
