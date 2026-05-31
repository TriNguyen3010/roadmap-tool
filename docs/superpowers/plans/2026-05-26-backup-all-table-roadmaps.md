# Backup All Table-Mode Roadmaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the daily local-backup job from one hardcoded roadmap to every `storage_mode = 'table'` roadmap in production, with per-roadmap archive files, aggregate + per-roadmap UI indicators, and isolated error handling.

**Architecture:** Reuse the existing per-roadmap dump script (`data/dump-prod.sh`) and turn the launchd wrapper (`data/dump-prod-scheduled.sh`) into a discovery-and-loop driver. A new `last-dump.json` shape carries an aggregate summary plus a per-roadmap status array. UI parses that JSON with a shared TS helper used by both the global `LocalBackupBanner` (aggregate) and a new `RoadmapBackupInfo` widget (per-roadmap, shown on the roadmap page).

**Tech Stack:** Bash + curl + Python3 (existing shell pipeline), Next.js 16 App Router, React 19, Vitest (node env), Tailwind, Supabase Postgres in local Docker.

**Spec:** [docs/superpowers/specs/2026-05-26-backup-all-table-roadmaps-design.md](../specs/2026-05-26-backup-all-table-roadmaps-design.md)

---

## File Map

| File | Type | Purpose |
|---|---|---|
| `src/utils/lastDump.ts` | new | Types + `parseLastDump()` — accepts both legacy (single-roadmap) and new (aggregate) shape, normalizes to one type |
| `src/utils/lastDump.test.ts` | new | Vitest unit tests for `parseLastDump()` covering both shapes + edge cases |
| `src/components/LocalBackupBanner.tsx` | modify | Render aggregate summary via `parseLastDump()`; backward-compat with legacy shape |
| `src/components/RoadmapBackupInfo.tsx` | new | Per-roadmap backup status, filtered by current roadmap id |
| `src/app/roadmap/[id]/page.tsx` | modify | Mount `<RoadmapBackupInfo roadmapId={...} />` right after `<LocalBackupBanner />` |
| `data/dump-prod.sh` | modify | Add fetch + SQL gen for `roadmap_item_changes` |
| `data/dump-prod-scheduled.sh` | modify | Discovery query → loop per roadmap → per-day subdir archive → aggregate `last-dump.json` |
| `package.json` | modify | Add `dump:all` script that runs `bash data/dump-prod-scheduled.sh` |

`src/app/api/last-dump/route.ts` does **not** change — it just streams the JSON file as-is.

---

## Task 1: Create `parseLastDump()` helper + tests (TDD)

**Files:**
- Create: `src/utils/lastDump.ts`
- Test: `src/utils/lastDump.test.ts`

Why first: the helper is a pure function with no React/DOM dependency. Vitest is configured for the `node` environment (`vitest.config.ts:11`), so we can TDD it in isolation. Both UI components depend on it.

- [ ] **Step 1.1: Write the failing test file**

Create `src/utils/lastDump.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLastDump } from './lastDump';

describe('parseLastDump', () => {
  it('parses the new aggregate shape', () => {
    const raw = {
      timestamp: '2026-05-26T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      elapsed: '180s',
      summary: { total: 5, success: 5, failed: 0 },
      roadmaps: [
        { roadmapId: 'a833', releaseName: 'Q2', status: 'success', fileSize: '368K', elapsed: '45s' },
        { roadmapId: 'b911', releaseName: 'Q3', status: 'failed', error: 'dump_failed' },
      ],
    };
    const parsed = parseLastDump(raw);
    expect(parsed.kind).toBe('aggregate');
    if (parsed.kind !== 'aggregate') throw new Error('narrow');
    expect(parsed.summary.total).toBe(5);
    expect(parsed.roadmaps).toHaveLength(2);
    expect(parsed.roadmaps[0].roadmapId).toBe('a833');
    expect(parsed.timestampLocal).toBe('2026-05-26 06:03:51');
  });

  it('parses the legacy single-roadmap shape', () => {
    const raw = {
      timestamp: '2026-05-25T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      roadmapId: 'a833',
      status: 'success',
      fileSize: '368K',
      elapsed: '45s',
    };
    const parsed = parseLastDump(raw);
    expect(parsed.kind).toBe('legacy');
    if (parsed.kind !== 'legacy') throw new Error('narrow');
    expect(parsed.roadmapId).toBe('a833');
    expect(parsed.status).toBe('success');
    expect(parsed.fileSize).toBe('368K');
  });

  it('parses the discovery_failed shape', () => {
    const raw = {
      timestamp: '2026-05-26T23:03:51Z',
      timestampLocal: '2026-05-26 06:03:51',
      elapsed: '5s',
      status: 'discovery_failed',
      error: 'Could not fetch roadmap list',
      summary: { total: 0, success: 0, failed: 0 },
      roadmaps: [],
    };
    const parsed = parseLastDump(raw);
    expect(parsed.kind).toBe('discovery_failed');
    if (parsed.kind !== 'discovery_failed') throw new Error('narrow');
    expect(parsed.error).toBe('Could not fetch roadmap list');
  });

  it('returns null for null/undefined/empty input', () => {
    expect(parseLastDump(null)).toBeNull();
    expect(parseLastDump(undefined)).toBeNull();
    expect(parseLastDump({})).toBeNull();
  });

  it('finds a roadmap by id in aggregate shape', () => {
    const raw = {
      timestamp: 't', timestampLocal: 'tl', elapsed: '10s',
      summary: { total: 2, success: 2, failed: 0 },
      roadmaps: [
        { roadmapId: 'a', releaseName: 'A', status: 'success', fileSize: '1K', elapsed: '5s' },
        { roadmapId: 'b', releaseName: 'B', status: 'success', fileSize: '2K', elapsed: '5s' },
      ],
    };
    const parsed = parseLastDump(raw);
    if (parsed?.kind !== 'aggregate') throw new Error('narrow');
    const found = parsed.roadmaps.find(r => r.roadmapId === 'b');
    expect(found?.releaseName).toBe('B');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run:
```bash
npx vitest run src/utils/lastDump.test.ts
```
Expected: FAIL with `Cannot find module './lastDump'` (or similar).

- [ ] **Step 1.3: Implement `lastDump.ts`**

Create `src/utils/lastDump.ts`:

```ts
export interface RoadmapBackup {
    roadmapId: string;
    releaseName: string;
    status: 'success' | 'failed';
    fileSize?: string;
    elapsed?: string;
    error?: string;
}

export interface AggregateDump {
    kind: 'aggregate';
    timestamp: string;
    timestampLocal: string;
    elapsed: string;
    summary: { total: number; success: number; failed: number };
    roadmaps: RoadmapBackup[];
}

export interface LegacyDump {
    kind: 'legacy';
    timestamp: string;
    timestampLocal: string;
    roadmapId: string;
    status: 'success' | 'failed' | string;
    fileSize: string;
    elapsed: string;
}

export interface DiscoveryFailedDump {
    kind: 'discovery_failed';
    timestamp: string;
    timestampLocal: string;
    elapsed: string;
    error: string;
}

export type LastDump = AggregateDump | LegacyDump | DiscoveryFailedDump;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

export function parseLastDump(raw: unknown): LastDump | null {
    if (!isRecord(raw)) return null;

    const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : '';
    const timestampLocal = typeof raw.timestampLocal === 'string' ? raw.timestampLocal : '';
    const elapsed = typeof raw.elapsed === 'string' ? raw.elapsed : '';

    if (raw.status === 'discovery_failed') {
        if (!timestampLocal) return null;
        return {
            kind: 'discovery_failed',
            timestamp,
            timestampLocal,
            elapsed,
            error: typeof raw.error === 'string' ? raw.error : 'discovery failed',
        };
    }

    if (isRecord(raw.summary) && Array.isArray(raw.roadmaps)) {
        const s = raw.summary;
        return {
            kind: 'aggregate',
            timestamp,
            timestampLocal,
            elapsed,
            summary: {
                total: typeof s.total === 'number' ? s.total : 0,
                success: typeof s.success === 'number' ? s.success : 0,
                failed: typeof s.failed === 'number' ? s.failed : 0,
            },
            roadmaps: raw.roadmaps.filter(isRecord).map((r): RoadmapBackup => ({
                roadmapId: typeof r.roadmapId === 'string' ? r.roadmapId : '',
                releaseName: typeof r.releaseName === 'string' ? r.releaseName : '',
                status: r.status === 'failed' ? 'failed' : 'success',
                fileSize: typeof r.fileSize === 'string' ? r.fileSize : undefined,
                elapsed: typeof r.elapsed === 'string' ? r.elapsed : undefined,
                error: typeof r.error === 'string' ? r.error : undefined,
            })),
        };
    }

    if (typeof raw.roadmapId === 'string' && typeof raw.status === 'string') {
        return {
            kind: 'legacy',
            timestamp,
            timestampLocal,
            roadmapId: raw.roadmapId,
            status: raw.status,
            fileSize: typeof raw.fileSize === 'string' ? raw.fileSize : '',
            elapsed: typeof raw.elapsed === 'string' ? raw.elapsed : '',
        };
    }

    return null;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/utils/lastDump.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/utils/lastDump.ts src/utils/lastDump.test.ts
git commit -m "feat(backup): add parseLastDump helper for legacy + aggregate shapes"
```

---

## Task 2: Extend `dump-prod.sh` to dump `roadmap_item_changes`

**Files:**
- Modify: `data/dump-prod.sh`

The table `roadmap_item_changes` (audit log) was created by migration `20260405100000_create_roadmap_item_changes.sql`. Columns:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `roadmap_id text NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE`
- `item_id text NOT NULL`
- `team text` (nullable)
- `field text NOT NULL`
- `old_value text` (nullable)
- `new_value text` (nullable)
- `changed_by text NOT NULL`
- `changed_at timestamptz NOT NULL DEFAULT now()`
- `changed_by_label text` (nullable, added by migration `20260405110000_add_changed_by_label.sql`)

- [ ] **Step 2.1: Add paginated fetch for `roadmap_item_changes`**

In `data/dump-prod.sh`, in the section `# [3/4] Fetching milestones, images, user settings...` (around the `fetch` calls), add after the existing fetches:

```bash
# Audit log (paginated, ordered by id for stable pagination)
fetch_paginated_by_id() {
  local table="$1"
  local filter="$2"
  local outfile="$3"
  local last_id=""
  local limit=1000

  echo "[]" > "$outfile"

  while true; do
    local page_file="${TMPDIR_DUMP}/page_changes_${RANDOM}.json"
    local url="${PROD_URL}/rest/v1/${table}?${filter}&select=*&order=id.asc&limit=${limit}"
    if [ -n "$last_id" ]; then
      url="${url}&id=gt.${last_id}"
    fi
    curl -s "$url" \
      -H "apikey: ${PROD_SERVICE_KEY}" \
      -H "Authorization: Bearer ${PROD_SERVICE_KEY}" \
      > "$page_file"

    local count
    count=$(python3 -c "import json; print(len(json.load(open('$page_file'))))")

    python3 -c "
import json
with open('$outfile') as f: existing = json.load(f)
with open('$page_file') as f: page = json.load(f)
with open('$outfile', 'w') as f: json.dump(existing + page, f)
"

    if [ "$count" -lt "$limit" ]; then
      break
    fi
    # last id of the page for keyset pagination
    last_id=$(python3 -c "import json; p = json.load(open('$page_file')); print(p[-1]['id'])")
  done
}

fetch_paginated_by_id "roadmap_item_changes" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/changes.json"
echo "  -> Changes: $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/changes.json'))))")"
```

Why keyset pagination (`id.gt.<last_id>`) instead of offset: PostgREST `offset` can drift if new rows arrive during dump. Keyset on UUID PK is stable.

Note: `roadmap_item_changes.id` is a UUID. Comparing UUIDs via `gt` works lexicographically in PostgREST and is stable here because we only need to read each row once — there is no ordering guarantee needed beyond "advance past what we already saw".

- [ ] **Step 2.2: Generate SQL for `roadmap_item_changes`**

In `data/dump-prod.sh`, inside the `python3 << 'PYEOF'` block, **before** the `lines.append('COMMIT;')` line, add:

```python
# 8. Audit log
with open(f'{tmpdir}/changes.json') as f: changes = json.load(f)
if changes:
    lines.append(f'-- 8. Audit log ({len(changes)} rows)')
    lines.append(f"DELETE FROM public.roadmap_item_changes WHERE roadmap_id = {esc(roadmap_id)};")
    for ch in changes:
        cols = 'id, roadmap_id, item_id, team, field, old_value, new_value, changed_by, changed_by_label, changed_at'
        vals = ', '.join([
            esc(ch.get('id')),
            esc(ch.get('roadmap_id')),
            esc(ch.get('item_id')),
            esc(ch.get('team')),
            esc(ch.get('field')),
            esc(ch.get('old_value')),
            esc(ch.get('new_value')),
            esc(ch.get('changed_by')),
            esc(ch.get('changed_by_label')),
            esc(ch.get('changed_at')),
        ])
        lines.append(f'INSERT INTO public.roadmap_item_changes ({cols}) VALUES ({vals});')
    lines.append('')
```

The `changes.json` load happens inline inside the section above (one line: `with open(f'{tmpdir}/changes.json') as f: changes = json.load(f)`). No other edits to the Python block are needed.

- [ ] **Step 2.3: Run dump-prod.sh against the existing hardcoded roadmap to smoke-test**

Run:
```bash
bash data/dump-prod.sh a8335e0e-55ec-42c9-920f-d64c32825cc8
```

Expected:
- All 4 steps print successfully.
- The console output includes the new `-> Changes: <N>` line.
- File `data/dump-a8335e0e-55ec-42c9-920f-d64c32825cc8.sql` exists and `grep -c 'INSERT INTO public.roadmap_item_changes' data/dump-a8335e0e-55ec-42c9-920f-d64c32825cc8.sql` returns ≥ 0 (≥1 if the roadmap has audit history).

- [ ] **Step 2.4: Import the generated SQL into local Supabase to verify it applies cleanly**

Run:
```bash
docker exec -i supabase_db_roadmap-tool psql -U postgres -d postgres < data/dump-a8335e0e-55ec-42c9-920f-d64c32825cc8.sql
```

Expected: ends with `COMMIT` and no errors. If there are FK violations or constraint failures, fix the SQL gen logic before continuing.

- [ ] **Step 2.5: Commit**

```bash
git add data/dump-prod.sh
git commit -m "feat(backup): include roadmap_item_changes audit log in per-roadmap dump"
```

---

## Task 3: Refactor `dump-prod-scheduled.sh` for discovery + loop + new aggregate `last-dump.json`

**Files:**
- Modify: `data/dump-prod-scheduled.sh`

This is the biggest change. Rewrite the script around three phases: **discovery**, **per-roadmap loop with isolated failures**, **aggregate metadata write**.

- [ ] **Step 3.1: Replace the entire contents of `data/dump-prod-scheduled.sh`**

Write:

```bash
#!/bin/bash
# ============================================================
# SCHEDULED DAILY DUMP: All table-mode roadmaps → Local Supabase
# ============================================================
# Called by launchd every day at 6:00 AM.
# Can also be run manually: bash data/dump-prod-scheduled.sh
# ============================================================

set -euo pipefail

# ---------- CONFIG ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_CONTAINER="supabase_db_roadmap-tool"
TODAY=$(date +%Y-%m-%d)
DUMPS_DIR="$SCRIPT_DIR/dumps"
LOGS_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOGS_DIR/dump-${TODAY}.log"
DAY_ARCHIVE_DIR="$DUMPS_DIR/$TODAY"
LAST_DUMP_FILE="$SCRIPT_DIR/last-dump.json"
TMPDIR_AGG=$(mktemp -d)
trap "rm -rf $TMPDIR_AGG" EXIT

# Production credentials (same as dump-prod.sh — kept in sync intentionally)
PROD_URL="https://halydtaufkhxxpxozxnb.supabase.co"
PROD_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbHlkdGF1ZmtoeHhweG96eG5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE0ODUxNSwiZXhwIjoyMDg3NzI0NTE1fQ.IEEVoA-RRYcS00rELZplIi87hQFZZeaevxXMuI5VWkE"

# Docker path resolution
if command -v docker &>/dev/null; then
    DOCKER_PATH="docker"
elif [ -x "$HOME/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
    DOCKER_PATH="$HOME/Applications/Docker.app/Contents/Resources/bin/docker"
elif [ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
    DOCKER_PATH="/Applications/Docker.app/Contents/Resources/bin/docker"
else
    echo "ERROR: Docker not found"
    exit 1
fi

mkdir -p "$DUMPS_DIR" "$LOGS_DIR" "$DAY_ARCHIVE_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---------- WRITE FAILED-STATE last-dump.json ----------
write_discovery_failed() {
    local err_msg="$1"
    local elapsed_total="$2"
    cat > "$LAST_DUMP_FILE" << ENDJSON
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "timestampLocal": "$(date '+%Y-%m-%d %H:%M:%S')",
  "elapsed": "${elapsed_total}s",
  "status": "discovery_failed",
  "error": "${err_msg}",
  "summary": { "total": 0, "success": 0, "failed": 0 },
  "roadmaps": []
}
ENDJSON
}

log "========== START daily dump =========="
JOB_START=$(date +%s)

# ---------- CHECK DOCKER ----------
if ! "$DOCKER_PATH" info &>/dev/null; then
    log "Docker not running. Starting Docker..."
    open -a Docker
    WAIT=0
    while ! "$DOCKER_PATH" info &>/dev/null; do
        sleep 5
        WAIT=$((WAIT + 5))
        if [ $WAIT -ge 60 ]; then
            log "ERROR: Docker failed to start after 60s"
            write_discovery_failed "Docker failed to start" "$WAIT"
            exit 1
        fi
    done
    log "Docker started after ${WAIT}s"
else
    log "Docker is running"
fi

# ---------- CHECK CONTAINER ----------
if ! "$DOCKER_PATH" ps --format '{{.Names}}' | grep -q "$LOCAL_CONTAINER"; then
    log "ERROR: Container $LOCAL_CONTAINER not running"
    write_discovery_failed "Local Supabase container not running" "$(( $(date +%s) - JOB_START ))"
    exit 1
fi
log "Container $LOCAL_CONTAINER is running"

# ---------- DISCOVERY: list all table-mode roadmaps ----------
log "Discovering table-mode roadmaps..."
DISCOVERY_FILE="$TMPDIR_AGG/roadmaps.json"
HTTP_CODE=$(curl -s -o "$DISCOVERY_FILE" -w "%{http_code}" \
    "${PROD_URL}/rest/v1/roadmaps?storage_mode=eq.table&select=id,release_name" \
    -H "apikey: ${PROD_SERVICE_KEY}" \
    -H "Authorization: Bearer ${PROD_SERVICE_KEY}" || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
    log "ERROR: Discovery query returned HTTP $HTTP_CODE"
    write_discovery_failed "Discovery HTTP $HTTP_CODE" "$(( $(date +%s) - JOB_START ))"
    exit 1
fi

if ! python3 -c "import json; json.load(open('$DISCOVERY_FILE'))" 2>/dev/null; then
    log "ERROR: Discovery response is not valid JSON"
    write_discovery_failed "Discovery response invalid JSON" "$(( $(date +%s) - JOB_START ))"
    exit 1
fi

ROADMAP_COUNT=$(python3 -c "import json; print(len(json.load(open('$DISCOVERY_FILE'))))")
log "Found $ROADMAP_COUNT table-mode roadmap(s)"

# ---------- LOOP ----------
RESULTS_FILE="$TMPDIR_AGG/results.json"
echo "[]" > "$RESULTS_FILE"

# Read (id, release_name) pairs as TSV
mapfile -t ROADMAPS < <(python3 -c "
import json
for r in json.load(open('$DISCOVERY_FILE')):
    name = (r.get('release_name') or '').replace('\t', ' ').replace('\n', ' ')
    print(f\"{r['id']}\t{name}\")
")

for line in "${ROADMAPS[@]}"; do
    RID="${line%%$'\t'*}"
    RNAME="${line#*$'\t'}"
    log "---- Roadmap $RID ($RNAME) ----"
    R_START=$(date +%s)

    R_STATUS="success"
    R_ERROR=""
    R_SIZE=""

    if bash "$PROJECT_DIR/data/dump-prod.sh" "$RID" >> "$LOG_FILE" 2>&1; then
        SOURCE_SQL="$PROJECT_DIR/data/dump-${RID}.sql"
        ARCHIVE_SQL="$DAY_ARCHIVE_DIR/${RID}.sql"
        if [ -f "$SOURCE_SQL" ]; then
            cp "$SOURCE_SQL" "$ARCHIVE_SQL"
            R_SIZE=$(du -h "$ARCHIVE_SQL" | cut -f1)
            log "Archived: dumps/${TODAY}/${RID}.sql ($R_SIZE)"
            if "$DOCKER_PATH" exec -i "$LOCAL_CONTAINER" psql -U postgres -d postgres < "$SOURCE_SQL" >> "$LOG_FILE" 2>&1; then
                log "Import OK"
            else
                R_STATUS="failed"
                R_ERROR="import_failed"
                log "ERROR: Import failed for $RID"
            fi
        else
            R_STATUS="failed"
            R_ERROR="dump_sql_missing"
            log "ERROR: Source SQL missing for $RID"
        fi
    else
        R_STATUS="failed"
        R_ERROR="dump_failed"
        log "ERROR: dump-prod.sh failed for $RID"
    fi

    R_ELAPSED=$(( $(date +%s) - R_START ))

    # Append result entry
    python3 - "$RESULTS_FILE" "$RID" "$RNAME" "$R_STATUS" "$R_SIZE" "${R_ELAPSED}s" "$R_ERROR" << 'PYEOF'
import json, sys
path, rid, rname, status, size, elapsed, err = sys.argv[1:8]
with open(path) as f: arr = json.load(f)
entry = { "roadmapId": rid, "releaseName": rname, "status": status, "elapsed": elapsed }
if size: entry["fileSize"] = size
if err:  entry["error"] = err
arr.append(entry)
with open(path, 'w') as f: json.dump(arr, f)
PYEOF
done

# ---------- AGGREGATE METADATA ----------
JOB_END=$(date +%s)
JOB_ELAPSED=$((JOB_END - JOB_START))

python3 - "$RESULTS_FILE" "$LAST_DUMP_FILE" "$JOB_ELAPSED" << 'PYEOF'
import json, sys, datetime
results_path, out_path, elapsed = sys.argv[1:4]
with open(results_path) as f: roadmaps = json.load(f)

total = len(roadmaps)
success = sum(1 for r in roadmaps if r.get('status') == 'success')
failed = total - success

now_utc = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
now_local = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

out = {
    "timestamp": now_utc,
    "timestampLocal": now_local,
    "elapsed": f"{elapsed}s",
    "summary": { "total": total, "success": success, "failed": failed },
    "roadmaps": roadmaps,
}
with open(out_path, 'w') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
PYEOF

log "Metadata written: last-dump.json"
log "========== DONE (${JOB_ELAPSED}s) =========="
```

- [ ] **Step 3.2: Verify shellcheck (best-effort) and syntax**

Run:
```bash
bash -n data/dump-prod-scheduled.sh
```
Expected: no output (syntax OK).

If `shellcheck` is available:
```bash
shellcheck data/dump-prod-scheduled.sh || true
```
Best-effort — quoting and shell warnings are OK. Stop only on hard errors.

- [ ] **Step 3.3: Dry-run discovery (without committing yet)**

Run the discovery curl manually to confirm the production query returns roadmaps:

```bash
curl -s "https://halydtaufkhxxpxozxnb.supabase.co/rest/v1/roadmaps?storage_mode=eq.table&select=id,release_name" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbHlkdGF1ZmtoeHhweG96eG5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE0ODUxNSwiZXhwIjoyMDg3NzI0NTE1fQ.IEEVoA-RRYcS00rELZplIi87hQFZZeaevxXMuI5VWkE" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbHlkdGF1ZmtoeHhweG96eG5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE0ODUxNSwiZXhwIjoyMDg3NzI0NTE1fQ.IEEVoA-RRYcS00rELZplIi87hQFZZeaevxXMuI5VWkE" \
  | python3 -m json.tool
```
Expected: a JSON array with at least one entry that includes the existing roadmap `a8335e0e-55ec-42c9-920f-d64c32825cc8`. Capture the count for the next step.

- [ ] **Step 3.4: Commit (script only — full run is the next task)**

```bash
git add data/dump-prod-scheduled.sh
git commit -m "feat(backup): scheduled dump now iterates all table-mode roadmaps"
```

---

## Task 4: Add `dump:all` npm script + run full end-to-end backup

**Files:**
- Modify: `package.json`

- [ ] **Step 4.1: Add `dump:all` script**

In `package.json`, in the `scripts` object, add:

```json
"dump:all": "bash data/dump-prod-scheduled.sh"
```

So the block looks like:

```json
"scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "backfill:roadmap-rows": "node scripts/backfill-roadmap-rows.mjs",
    "dump:all": "bash data/dump-prod-scheduled.sh"
}
```

- [ ] **Step 4.2: Run the full backup end-to-end**

```bash
npm run dump:all
```

Expected behavior:
- Discovery succeeds (HTTP 200, valid JSON, N ≥ 1 roadmaps).
- Loop runs for each roadmap. Console + `data/logs/dump-<TODAY>.log` show one `---- Roadmap <id> (<name>) ----` block per roadmap.
- Files exist at `data/dumps/<TODAY>/<roadmap_id>.sql` for each successful one.
- `data/last-dump.json` has the new aggregate shape.
- Final `========== DONE (<N>s) ==========` line.

- [ ] **Step 4.3: Inspect `last-dump.json`**

```bash
cat data/last-dump.json | python3 -m json.tool
```

Expected: top-level `timestamp`, `timestampLocal`, `elapsed`, `summary.{total,success,failed}`, `roadmaps[].{roadmapId,releaseName,status,fileSize?,elapsed,error?}`. The count in `summary.total` matches the discovery count from Step 3.3.

- [ ] **Step 4.4: Commit**

```bash
git add package.json
git commit -m "chore(backup): add dump:all npm script"
```

---

## Task 5: Update `LocalBackupBanner.tsx` to render aggregate summary

**Files:**
- Modify: `src/components/LocalBackupBanner.tsx`

- [ ] **Step 5.1: Replace the contents of `src/components/LocalBackupBanner.tsx`**

Write:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { parseLastDump, type LastDump } from '@/utils/lastDump';

export function LocalBackupBanner() {
    const [dump, setDump] = useState<LastDump | null>(null);
    const [isLocal, setIsLocal] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') return;
        setIsLocal(true);

        fetch('/api/last-dump')
            .then(res => res.ok ? res.json() : null)
            .then((data: unknown) => {
                const parsed = parseLastDump(data);
                if (parsed) setDump(parsed);
            })
            .catch(() => {});
    }, []);

    if (!isLocal || !dump) return null;

    if (dump.kind === 'discovery_failed') {
        return (
            <div className="flex items-center justify-center gap-2 bg-red-50 border-b border-red-200 px-3 py-1 text-[11px] text-red-700">
                <span className="font-semibold">Local Backup:</span>
                <span>{dump.timestampLocal}</span>
                <span className="text-red-400">|</span>
                <span className="font-semibold">Discovery failed:</span>
                <span>{dump.error}</span>
            </div>
        );
    }

    if (dump.kind === 'legacy') {
        const ok = dump.status === 'success';
        return (
            <div className={`flex items-center justify-center gap-2 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'} border-b px-3 py-1 text-[11px]`}>
                <span className="font-semibold">Local Backup:</span>
                <span>{dump.timestampLocal}</span>
                <span className="opacity-60">|</span>
                <span>{dump.fileSize}</span>
                <span className="opacity-60">|</span>
                <span>{dump.elapsed}</span>
                <span className="opacity-60">|</span>
                <span className="font-semibold">{ok ? 'OK' : dump.status}</span>
            </div>
        );
    }

    // aggregate
    const { summary, timestampLocal, elapsed } = dump;
    const hasFailed = summary.failed > 0;
    const bgClass = hasFailed
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700';

    return (
        <div className={`flex items-center justify-center gap-2 ${bgClass} border-b px-3 py-1 text-[11px]`}>
            <span className="font-semibold">Local Backup:</span>
            <span>{timestampLocal}</span>
            <span className="opacity-60">|</span>
            <span>{summary.success}/{summary.total} OK</span>
            {hasFailed && (
                <>
                    <span className="opacity-60">|</span>
                    <span className="font-semibold">{summary.failed} failed</span>
                </>
            )}
            <span className="opacity-60">|</span>
            <span>{elapsed}</span>
        </div>
    );
}
```

- [ ] **Step 5.2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors related to `LocalBackupBanner` or `lastDump`.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/LocalBackupBanner.tsx
git commit -m "feat(backup): banner shows aggregate summary across all roadmaps"
```

---

## Task 6: Create `RoadmapBackupInfo.tsx`

**Files:**
- Create: `src/components/RoadmapBackupInfo.tsx`

- [ ] **Step 6.1: Write the component**

Create `src/components/RoadmapBackupInfo.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { parseLastDump, type RoadmapBackup } from '@/utils/lastDump';

interface Props {
    roadmapId: string;
}

export function RoadmapBackupInfo({ roadmapId }: Props) {
    const [entry, setEntry] = useState<RoadmapBackup | null>(null);
    const [isLocal, setIsLocal] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') return;
        setIsLocal(true);

        fetch('/api/last-dump')
            .then(res => res.ok ? res.json() : null)
            .then((data: unknown) => {
                const parsed = parseLastDump(data);
                if (!parsed) return;
                if (parsed.kind === 'aggregate') {
                    const found = parsed.roadmaps.find(r => r.roadmapId === roadmapId);
                    if (found) setEntry(found);
                } else if (parsed.kind === 'legacy' && parsed.roadmapId === roadmapId) {
                    setEntry({
                        roadmapId: parsed.roadmapId,
                        releaseName: '',
                        status: parsed.status === 'success' ? 'success' : 'failed',
                        fileSize: parsed.fileSize,
                        elapsed: parsed.elapsed,
                    });
                }
            })
            .catch(() => {});
    }, [roadmapId]);

    if (!isLocal || !entry) return null;

    const ok = entry.status === 'success';
    const cls = ok
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-red-50 border-red-200 text-red-700';

    return (
        <div className={`flex items-center justify-center gap-2 ${cls} border-b px-3 py-1 text-[11px]`}>
            <span className="font-semibold">This roadmap backup:</span>
            {entry.fileSize && <span>{entry.fileSize}</span>}
            {entry.fileSize && <span className="opacity-60">|</span>}
            {entry.elapsed && <span>{entry.elapsed}</span>}
            {entry.elapsed && <span className="opacity-60">|</span>}
            <span className="font-semibold">{ok ? 'OK' : (entry.error || 'failed')}</span>
        </div>
    );
}
```

- [ ] **Step 6.2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/RoadmapBackupInfo.tsx
git commit -m "feat(backup): add RoadmapBackupInfo per-roadmap status widget"
```

---

## Task 7: Mount `RoadmapBackupInfo` on the roadmap page + UI smoke test

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

The current `LocalBackupBanner` is mounted at line 1885 inside the `<main>` element. We add `RoadmapBackupInfo` immediately after.

- [ ] **Step 7.1: Add the import**

In `src/app/roadmap/[id]/page.tsx`, find the existing line:

```ts
import { LocalBackupBanner } from '@/components/LocalBackupBanner';
```

Add immediately after:

```ts
import { RoadmapBackupInfo } from '@/components/RoadmapBackupInfo';
```

- [ ] **Step 7.2: Locate the roadmap id available in render scope**

Search the file for where the URL param `id` is read:

```bash
grep -n "useParams\|params\." src/app/roadmap/\[id\]/page.tsx | head -10
```

Confirm there is a `roadmapId` (or equivalent string) variable available where `<LocalBackupBanner />` renders. If the variable is named differently (e.g., `id`, `documentId`, `paramId`), use that name in the next step.

- [ ] **Step 7.3: Mount the widget**

Find the existing line:

```tsx
<LocalBackupBanner />
```

Replace with:

```tsx
<LocalBackupBanner />
<RoadmapBackupInfo roadmapId={roadmapId} />
```

Where `roadmapId` is the variable identified in Step 7.2. If it lives in a different scope, hoist or pass through as appropriate; do not invent a new state. If the available variable is named `id`, write `roadmapId={id}` instead.

- [ ] **Step 7.4: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7.5: Start dev server and smoke test**

Run:
```bash
npm run dev
```

In a browser, open `http://localhost:3000/roadmap/a8335e0e-55ec-42c9-920f-d64c32825cc8`. Verify:

1. Top of page shows **two** thin banners stacked:
   - First (green): `Local Backup: <date> | <N>/<N> OK | <elapsed>`
   - Second (green): `This roadmap backup: <size> | <elapsed> | OK`
2. Open a different roadmap id (one that was also dumped) — second banner shows that roadmap's own size/elapsed.
3. Open a roadmap id that is **not** in `last-dump.json.roadmaps[]` (e.g., a brand-new or json-mode roadmap) — only the first banner shows; the second is hidden.

If the aggregate banner shows red `N failed`, that is also a valid render — but for this smoke test we expect green.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/roadmap/\[id\]/page.tsx
git commit -m "feat(backup): mount RoadmapBackupInfo on roadmap page"
```

---

## Task 8: Final verification (full backup → UI matches)

- [ ] **Step 8.1: Run full backup again to refresh data**

```bash
npm run dump:all
```

Wait for `========== DONE (<N>s) ==========`.

- [ ] **Step 8.2: Verify archives exist for today**

Run:
```bash
ls data/dumps/$(date +%Y-%m-%d)/
```
Expected: one `.sql` file per row in `summary.total`.

- [ ] **Step 8.3: Verify each archive imports cleanly into local Supabase**

This already happens inside `dump-prod-scheduled.sh`. Confirm by tailing the log:

```bash
tail -50 data/logs/dump-$(date +%Y-%m-%d).log | grep -E "Import OK|ERROR"
```
Expected: only `Import OK` lines (no `ERROR`).

- [ ] **Step 8.4: Refresh the dev server browser tab**

In the browser, hard-reload the roadmap page (Cmd+Shift+R). Confirm both banners now show today's timestamp from the freshly-written `data/last-dump.json`.

- [ ] **Step 8.5: Optional — simulate a per-roadmap failure**

To verify the "X/Y OK · 1 failed" red banner path, temporarily break one roadmap dump:

```bash
# In a scratch terminal — DO NOT COMMIT
ORIG=$(cat data/dump-prod.sh)
sed -i.bak 's|fetch_paginated "roadmap_items"|fetch_paginated "roadmap_items_DOES_NOT_EXIST"|' data/dump-prod.sh
npm run dump:all
# Restore
mv data/dump-prod.sh.bak data/dump-prod.sh
```

Expected: the banner turns red, `summary.failed >= 1`, and `roadmaps[].error` for the affected entries is `dump_failed`. Then run `npm run dump:all` once more to restore green state.

**Do not commit the test breakage** — only `git status` to confirm nothing is staged after restore.

---

## Acceptance Criteria

- [ ] `parseLastDump()` tests pass (5 tests).
- [ ] `tsc --noEmit` passes for the whole repo.
- [ ] `npm run dump:all` runs end-to-end with at least 1 success.
- [ ] `data/last-dump.json` has the aggregate shape with `summary` + `roadmaps[]`.
- [ ] `data/dumps/<TODAY>/<roadmap_id>.sql` exists for every successful roadmap.
- [ ] `roadmap_item_changes` rows appear inside each per-roadmap SQL file (when the source roadmap has audit history).
- [ ] Top of `/roadmap/<id>` shows aggregate banner + per-roadmap banner.
- [ ] Roadmaps not in the dump list (json-mode or brand-new) only show the aggregate banner.
- [ ] launchd job at 6 AM still works (no plist changes needed — same wrapper path).

---

## Out of Scope (per spec)

- No automatic retry on failure.
- No external alerts (Slack/email).
- No changes to launchd schedule.
- No cleanup of old `data/dumps/` files.
- Legacy flat-file dumps (`data/dumps/2026-04-XX.sql`) are not migrated.
