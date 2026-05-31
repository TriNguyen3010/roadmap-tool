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
# dump-prod.sh writes its SQL to a path relative to CWD, so anchor at the project
# root — launchd invokes this script with an unrelated working directory.
cd "$PROJECT_DIR"
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
            write_discovery_failed "Docker failed to start" "$(( $(date +%s) - JOB_START ))"
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
ROADMAPS=()
while IFS= read -r line; do
    ROADMAPS+=("$line")
done < <(python3 -c "
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
            R_SIZE=$(du -h "$ARCHIVE_SQL" | awk '{print $1}')
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

now_utc = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
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
