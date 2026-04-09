# Plan: Tự động dump data production xuống local mỗi ngày

## Mục tiêu

- Mỗi ngày tự động dump data production về local Supabase
- Lưu trữ file SQL theo ngày (giữ hết, không xóa)
- Ghi log thành công/thất bại
- Không cần thao tác tay — mở máy lên là tự chạy

## Hiện trạng

### Đã có

- `data/dump-prod.sh` — script dump thủ công, chạy tay bằng `./data/dump-prod.sh <roadmap_id>`
- Dump 6 bảng: `roadmaps`, `roadmap_items`, `roadmap_milestones`, `roadmap_item_images`, `roadmap_user_settings`, `team_members`
- Output: 1 file SQL, import vào local Supabase qua Docker

### Chưa có

- Chạy tự động theo lịch
- Lưu trữ theo ngày
- Log
- Auto-start Docker nếu chưa bật

## Thiết kế

### Cấu trúc file

```
data/
├── dump-prod.sh                ← script hiện tại (không đổi)
├── dump-prod-scheduled.sh      ← MỚI: wrapper script
├── com.roadmap.dump-prod.plist ← MỚI: launchd config
├── dumps/                      ← MỚI: thư mục lưu trữ theo ngày
│   ├── 2026-04-09.sql
│   ├── 2026-04-10.sql
│   └── ...
└── logs/                       ← MỚI: thư mục log
    ├── dump-2026-04-09.log
    ├── dump-2026-04-10.log
    └── ...
```

### File 1: `data/dump-prod-scheduled.sh`

Wrapper script — được launchd gọi mỗi ngày.

**Flow:**

```
1. Ghi log bắt đầu
2. Check Docker running?
   → Không: start Docker, chờ tối đa 60s
   → Vẫn không: log lỗi, thoát
3. Check local Supabase container running?
   → Không: log lỗi, thoát
4. Chạy dump-prod.sh a8335e0e-55ec-42c9-920f-d64c32825cc8
5. Copy file SQL → data/dumps/YYYY-MM-DD.sql
6. Import SQL vào local Supabase
7. Ghi log kết quả + thời gian chạy
```

**Nội dung script:**

```bash
#!/bin/bash
set -euo pipefail

# ---------- CONFIG ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROADMAP_ID="a8335e0e-55ec-42c9-920f-d64c32825cc8"
LOCAL_CONTAINER="supabase_db_roadmap-tool"
DOCKER_PATH="$HOME/Applications/Docker.app/Contents/Resources/bin/docker"
TODAY=$(date +%Y-%m-%d)
DUMPS_DIR="$SCRIPT_DIR/dumps"
LOGS_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOGS_DIR/dump-${TODAY}.log"

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
fi

# ---------- CHECK CONTAINER ----------
if ! "$DOCKER_PATH" ps --format '{{.Names}}' | grep -q "$LOCAL_CONTAINER"; then
    log "ERROR: Container $LOCAL_CONTAINER not running"
    log "Hint: run 'npx supabase start' first"
    exit 1
fi

# ---------- RUN DUMP ----------
log "Running dump-prod.sh..."
cd "$PROJECT_DIR"
if bash data/dump-prod.sh "$ROADMAP_ID" >> "$LOG_FILE" 2>&1; then
    log "dump-prod.sh completed successfully"
else
    log "ERROR: dump-prod.sh failed with exit code $?"
    exit 1
fi

# ---------- ARCHIVE SQL ----------
SOURCE_SQL="data/dump-${ROADMAP_ID}.sql"
ARCHIVE_SQL="$DUMPS_DIR/${TODAY}.sql"
if [ -f "$SOURCE_SQL" ]; then
    cp "$SOURCE_SQL" "$ARCHIVE_SQL"
    FILE_SIZE=$(du -h "$ARCHIVE_SQL" | cut -f1)
    log "Archived: $ARCHIVE_SQL ($FILE_SIZE)"
else
    log "WARNING: SQL file not found at $SOURCE_SQL"
fi

# ---------- IMPORT TO LOCAL ----------
log "Importing to local Supabase..."
if "$DOCKER_PATH" exec -i "$LOCAL_CONTAINER" psql -U postgres -d postgres < "$SOURCE_SQL" >> "$LOG_FILE" 2>&1; then
    log "Import successful"
else
    log "ERROR: Import failed"
    exit 1
fi

# ---------- DONE ----------
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
log "========== DONE (${ELAPSED}s) =========="
```

### File 2: `data/com.roadmap.dump-prod.plist`

macOS launchd config — đăng ký lịch chạy.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.roadmap.dump-prod</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/data/dump-prod-scheduled.sh</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/data/logs/launchd-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/data/logs/launchd-stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

**Giải thích config:**

| Key | Giá trị | Ý nghĩa |
|-----|---------|---------|
| `StartCalendarInterval` | Hour=9, Minute=0 | Chạy lúc 9:00 sáng mỗi ngày |
| `StandardOutPath/ErrorPath` | logs/ | Capture output từ launchd |
| `PATH` | Bao gồm homebrew | Để tìm được `python3`, `curl` |

**Hành vi launchd:**
- Máy đang bật lúc 9h → chạy đúng 9h
- Máy sleep lúc 9h, mở lúc 10h → chạy bù ngay lúc 10h
- Máy tắt cả ngày → chạy bù khi mở máy ngày hôm sau

## Setup (chạy 1 lần)

```bash
# 1. Tạo thư mục
mkdir -p data/dumps data/logs

# 2. Chmod script
chmod +x data/dump-prod-scheduled.sh

# 3. Copy plist vào LaunchAgents
cp data/com.roadmap.dump-prod.plist ~/Library/LaunchAgents/

# 4. Đăng ký lịch
launchctl load ~/Library/LaunchAgents/com.roadmap.dump-prod.plist
```

## Vận hành

| Muốn | Lệnh |
|------|-------|
| Chạy tay ngay | `bash data/dump-prod-scheduled.sh` |
| Xem log hôm nay | `cat data/logs/dump-$(date +%Y-%m-%d).log` |
| Xem log launchd | `cat data/logs/launchd-stderr.log` |
| Quay local về ngày cụ thể | `docker exec -i supabase_db_roadmap-tool psql -U postgres -d postgres < data/dumps/2026-04-09.sql` |
| Tạm dừng | `launchctl unload ~/Library/LaunchAgents/com.roadmap.dump-prod.plist` |
| Bật lại | `launchctl load ~/Library/LaunchAgents/com.roadmap.dump-prod.plist` |
| Đổi giờ chạy | Sửa `Hour` trong plist → unload → load lại |

## Log format

```
[2026-04-09 09:00:01] ========== START daily dump ==========
[2026-04-09 09:00:01] Roadmap: a8335e0e-55ec-42c9-920f-d64c32825cc8
[2026-04-09 09:00:02] Running dump-prod.sh...
[2026-04-09 09:00:08] dump-prod.sh completed successfully
[2026-04-09 09:00:08] Archived: data/dumps/2026-04-09.sql (185K)
[2026-04-09 09:00:09] Importing to local Supabase...
[2026-04-09 09:00:12] Import successful
[2026-04-09 09:00:12] ========== DONE (11s) ==========
```

## Dung lượng

| Loại | Ước tính | Ghi chú |
|------|----------|---------|
| SQL mỗi ngày | ~150-200KB | 1 roadmap, ~300 items |
| Log mỗi ngày | ~1-2KB | Text thuần |
| 1 năm dumps | ~73MB | Giữ hết, không xóa |
| 1 năm logs | ~500KB | Giữ hết, không xóa |

## Lưu ý

- `data/dumps/` và `data/logs/` nên thêm vào `.gitignore` (không push lên repo)
- Nếu đổi máy: cần chạy lại bước Setup
- Docker phải được cài sẵn, script chỉ auto-start chứ không auto-install
- Nếu local Supabase container chưa start (`npx supabase start`), script sẽ báo lỗi trong log
