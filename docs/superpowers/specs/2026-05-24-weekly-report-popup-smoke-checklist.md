# Weekly Report Popup — Manual Smoke Checklist

**For:** Tri Nguyen, after applying the migration and creating the Supabase Storage bucket
**Branch under test:** `claude/vigorous-turing-a8eff3`
**Implementation plan:** `docs/superpowers/plans/2026-05-24-weekly-report-popup.md` (Task 22)

This worktree has no live Supabase or `.env.local`, so the automated portion of the smoke test has been completed (`npm test`, `npm run lint`, `npx tsc --noEmit`); the live portion is for the human to run after applying the migration and provisioning the bucket.

## Pre-flight (one-time, in the real environment)

1. Apply the migration to the actual Supabase project:
   ```bash
   supabase db push   # or: supabase migration up
   ```
   Verify the `public.reports` table exists with the expected columns.

2. Create the Storage bucket in Supabase Studio:
   - Name: `reports`
   - **Privacy: Private** (must not be public)

3. Add env vars to `.env.local` (defaults are fine to start):
   ```
   REPORT_UPLOAD_MAX_MB=10
   REPORT_STORAGE_BUCKET=reports
   REPORT_UPLOAD_RATE_LIMIT_MAX=10
   REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS=60000
   REPORT_DELETE_RATE_LIMIT_MAX=20
   REPORT_DELETE_RATE_LIMIT_WINDOW_MS=60000
   REPORT_DOWNLOAD_RATE_LIMIT_MAX=60
   REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS=60000
   ```

4. Start the dev server: `npm run dev`

## Automated checks already passing on this branch

- `npm test` — 25 files / 131 tests passing
- `npm run lint` — 2 errors remaining are pre-existing on the branch (`LocalBackupBanner.tsx:21`, `QuickFilterButton.tsx:27`); 0 new errors introduced by this feature
- `npx tsc --noEmit` — clean

## Manual scenarios

### Empty-state baseline

- [ ] Hit `GET /api/reports/months` → `{ months: ["<current YYYY-MM>"], requestId: "..." }` (fallback to today when DB empty)
- [ ] Hit `GET /api/reports?month=2026-05` → `{ reports: [], requestId: "..." }`
- [ ] Open a roadmap in the browser. Verify the new **Reports** button appears in the Toolbar with a `FileText` icon.

### Upload happy path (editor)

- [ ] Log in as editor.
- [ ] Click **Reports** in the Toolbar → side panel slides in from the right.
- [ ] Click **Upload .docx** → dialog opens with `role="dialog"`, `aria-modal`.
- [ ] Pick `~/Downloads/SW _ Week 21 Report _ 1805 -2205.docx` → file metadata shows.
- [ ] Click **Upload** → spinner shows; on success the dialog closes and a success toast appears.
- [ ] Verify the row appears in the list with:
  - Title: `Week 21 · 18/05 - 22/05`
  - Subtitle: `Sprint 77 · 2026-05-19 · <your editor label>`

### Popup behavior

- [ ] Click the row → floating popup opens, centered, with the formatted Vietnamese content (heading + bullets visible).
- [ ] Drag the header bar → popup follows cursor.
- [ ] Drag the SE-corner handle → popup resizes; respects min 320 × 240.
- [ ] Refresh the page, re-open the popup → position and size are preserved.
- [ ] Press `Escape` → popup closes.
- [ ] Re-open the popup, click **Download** in the header → browser downloads/opens the original `.docx`.

### Bad inputs

- [ ] Upload a `.pdf` → 400 `INVALID_FILE_TYPE`, friendly toast.
- [ ] Upload an `.docx` > 10 MB → 400 `FILE_TOO_LARGE`.
- [ ] Burst 11 uploads in < 60 s → 11th returns 429 `RATE_LIMITED` (default editor rate is 10/min).
- [ ] Send `metadata` with `month: "../../etc"` in a hand-crafted multipart POST → 400 `BAD_REQUEST` (path-traversal guard).

### Delete + month cleanup

- [ ] Click **Delete** on a row → confirm dialog → row disappears.
- [ ] If it was the last report in that month, the month picker drops the option.
- [ ] Confirm `GET /api/reports/months` reflects the change.
- [ ] Confirm the file is gone from the Storage bucket (Supabase Studio → Storage → `reports/<month>/`).

### Non-editor (public) viewing

- [ ] Log out (or open in an incognito window with no editor session).
- [ ] Open a roadmap → **Reports** button still visible.
- [ ] Open panel → reports list still shows; **Upload** button is HIDDEN; per-row **Delete** is HIDDEN.
- [ ] Click a row → popup opens; download button still works.

### Auth check (direct API)

- [ ] `curl -X POST /api/reports -F file=@sample.docx` without editor session → 401 `UNAUTHORIZED`.
- [ ] `curl -X DELETE /api/reports/<id>` without editor session → 401 `UNAUTHORIZED`.

### Non-UUID id

- [ ] `curl /api/reports/not-a-uuid` → 404 `NOT_FOUND` (not 500).
- [ ] `curl /api/reports/not-a-uuid/download` → 404 `NOT_FOUND`.

## Known follow-ups (out of scope; tracked separately)

- Block `data:` hrefs in the HTML sanitizer (in addition to `javascript:`) — spawned task in conversation history.
- In-memory rate limiter doesn't survive serverless cold starts — pre-existing project limitation; consider Upstash before production serverless deploy.
- Pre-existing lint errors in `LocalBackupBanner.tsx` and `QuickFilterButton.tsx` — not caused by this feature.
