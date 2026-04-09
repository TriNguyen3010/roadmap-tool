#!/bin/bash
# ============================================================
# SCHEDULED DAILY DUMP: Production → Local Supabase
# ============================================================
# Called by launchd every day at 9:00 AM
# Can also be run manually: bash data/dump-prod-scheduled.sh
# ============================================================

set -euo pipefail

# ---------- CONFIG ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROADMAP_ID="a8335e0e-55ec-42c9-920f-d64c32825cc8"
LOCAL_CONTAINER="supabase_db_roadmap-tool"
TODAY=$(date +%Y-%m-%d)
DUMPS_DIR="$SCRIPT_DIR/dumps"
LOGS_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOGS_DIR/dump-${TODAY}.log"

# Docker path: try system docker first, then Docker.app
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

# ---------- SETUP ----------
mkdir -p "$DUMPS_DIR" "$LOGS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== START daily dump =========="
log "Roadmap: $ROADMAP_ID"
START_TIME=$(date +%s)

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
    log "Hint: run 'npx supabase start' in project directory first"
    exit 1
fi
log "Container $LOCAL_CONTAINER is running"

# ---------- RUN DUMP ----------
log "Running dump-prod.sh..."
cd "$PROJECT_DIR"
if bash data/dump-prod.sh "$ROADMAP_ID" >> "$LOG_FILE" 2>&1; then
    log "dump-prod.sh completed successfully"
else
    EXIT_CODE=$?
    log "ERROR: dump-prod.sh failed with exit code $EXIT_CODE"
    exit 1
fi

# ---------- ARCHIVE SQL ----------
SOURCE_SQL="data/dump-${ROADMAP_ID}.sql"
ARCHIVE_SQL="$DUMPS_DIR/${TODAY}.sql"
if [ -f "$SOURCE_SQL" ]; then
    cp "$SOURCE_SQL" "$ARCHIVE_SQL"
    FILE_SIZE=$(du -h "$ARCHIVE_SQL" | cut -f1)
    log "Archived: dumps/${TODAY}.sql ($FILE_SIZE)"
else
    log "WARNING: SQL file not found at $SOURCE_SQL"
fi

# ---------- IMPORT TO LOCAL ----------
log "Importing to local Supabase..."
if "$DOCKER_PATH" exec -i "$LOCAL_CONTAINER" psql -U postgres -d postgres < "$SOURCE_SQL" >> "$LOG_FILE" 2>&1; then
    log "Import successful"
else
    log "ERROR: Import to local Supabase failed"
    exit 1
fi

# ---------- DONE ----------
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
log "========== DONE (${ELAPSED}s) =========="
