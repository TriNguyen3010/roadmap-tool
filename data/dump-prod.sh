#!/bin/bash
# ============================================================
# DUMP PRODUCTION ROADMAP TO LOCAL SUPABASE
# ============================================================
# Usage:
#   ./data/dump-prod.sh <roadmap_id>
#
# Example:
#   ./data/dump-prod.sh a8335e0e-55ec-42c9-920f-d64c32825cc8
#
# Prerequisites:
#   - Docker running (local Supabase)
#   - Production Supabase credentials below
# ============================================================

set -euo pipefail

# ---------- CONFIG ----------
PROD_URL="https://halydtaufkhxxpxozxnb.supabase.co"
PROD_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbHlkdGF1ZmtoeHhweG96eG5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE0ODUxNSwiZXhwIjoyMDg3NzI0NTE1fQ.IEEVoA-RRYcS00rELZplIi87hQFZZeaevxXMuI5VWkE"

LOCAL_CONTAINER="supabase_db_roadmap-tool"

# ---------- VALIDATE ----------
ROADMAP_ID="${1:?Usage: ./data/dump-prod.sh <roadmap_id>}"
OUTPUT_FILE="data/dump-${ROADMAP_ID}.sql"
TMPDIR_DUMP=$(mktemp -d)
trap "rm -rf $TMPDIR_DUMP" EXIT

echo "=========================================="
echo "  Dump Production -> Local"
echo "  Roadmap: ${ROADMAP_ID}"
echo "=========================================="

# Helper: fetch from Supabase REST API
fetch() {
  local table="$1"
  local filter="$2"
  local outfile="$3"

  curl -s \
    "${PROD_URL}/rest/v1/${table}?${filter}&select=*" \
    -H "apikey: ${PROD_SERVICE_KEY}" \
    -H "Authorization: Bearer ${PROD_SERVICE_KEY}" \
    > "$outfile"
}

# Helper: fetch with pagination (for large tables)
fetch_paginated() {
  local table="$1"
  local filter="$2"
  local outfile="$3"
  local offset=0
  local limit=1000

  echo "[]" > "$outfile"

  while true; do
    local page_file="${TMPDIR_DUMP}/page_${offset}.json"
    curl -s \
      "${PROD_URL}/rest/v1/${table}?${filter}&select=*&order=sort_order&offset=${offset}&limit=${limit}" \
      -H "apikey: ${PROD_SERVICE_KEY}" \
      -H "Authorization: Bearer ${PROD_SERVICE_KEY}" \
      > "$page_file"

    local count
    count=$(python3 -c "import json; print(len(json.load(open('$page_file'))))")

    # Merge into outfile
    python3 -c "
import json
with open('$outfile') as f: existing = json.load(f)
with open('$page_file') as f: page = json.load(f)
with open('$outfile', 'w') as f: json.dump(existing + page, f)
"

    if [ "$count" -lt "$limit" ]; then
      break
    fi
    offset=$((offset + limit))
  done
}

# ---------- STEP 1: Fetch all data ----------
echo ""
echo "[1/4] Fetching roadmap metadata..."
fetch "roadmaps" "id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/metadata.json"

META_COUNT=$(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/metadata.json'))))")
if [ "$META_COUNT" = "0" ]; then
  echo "ERROR: Roadmap '${ROADMAP_ID}' not found in production!"
  exit 1
fi
echo "  -> Found: $(python3 -c "import json; print(json.load(open('${TMPDIR_DUMP}/metadata.json'))[0].get('release_name','?'))")"

echo ""
echo "[2/4] Fetching roadmap items (paginated)..."
fetch_paginated "roadmap_items" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/items.json"
echo "  -> $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/items.json'))))" ) items"

echo ""
echo "[3/4] Fetching milestones, images, user settings..."
fetch "roadmap_milestones" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/milestones.json"
fetch "roadmap_item_images" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/images.json"
fetch "roadmap_user_settings" "roadmap_id=eq.${ROADMAP_ID}" "${TMPDIR_DUMP}/user_settings.json"
fetch "team_members" "select=*" "${TMPDIR_DUMP}/team_members.json"

echo "  -> Milestones: $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/milestones.json'))))")"
echo "  -> Images: $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/images.json'))))")"
echo "  -> User settings: $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/user_settings.json'))))")"
echo "  -> Team members: $(python3 -c "import json; print(len(json.load(open('${TMPDIR_DUMP}/team_members.json'))))")"

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

# ---------- STEP 2: Generate SQL via Python ----------
echo ""
echo "[4/4] Generating SQL file..."

export ROADMAP_ID TMPDIR_DUMP OUTPUT_FILE
python3 << 'PYEOF'
import json, sys, os

roadmap_id = os.environ['ROADMAP_ID']
tmpdir = os.environ['TMPDIR_DUMP']
output_file = os.environ['OUTPUT_FILE']

with open(f'{tmpdir}/metadata.json') as f: metadata = json.load(f)
with open(f'{tmpdir}/items.json') as f: items = json.load(f)
with open(f'{tmpdir}/milestones.json') as f: milestones = json.load(f)
with open(f'{tmpdir}/images.json') as f: images = json.load(f)
with open(f'{tmpdir}/user_settings.json') as f: user_settings = json.load(f)
with open(f'{tmpdir}/team_members.json') as f: team_members = json.load(f)

def esc(v):
    if v is None:
        return 'NULL'
    s = str(v).replace("'", "''")
    return f"'{s}'"

def esc_jsonb(v):
    if v is None:
        return 'NULL'
    return f"'{json.dumps(v, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}'::jsonb"

lines = []
lines.append('-- Auto-generated dump from production')
lines.append(f'-- Roadmap: {roadmap_id}')
lines.append('-- Generated by dump-prod.sh')
lines.append('')
lines.append('BEGIN;')
lines.append('SET CONSTRAINTS ALL DEFERRED;')
lines.append('')

# 1. Metadata
r = metadata[0]
lines.append('-- 1. Roadmap metadata')
lines.append(f"""INSERT INTO public.roadmaps (id, release_name, start_date, end_date, created_at, updated_at)
VALUES ({esc(r['id'])}, {esc(r.get('release_name',''))}, {esc(r.get('start_date',''))}, {esc(r.get('end_date',''))}, now(), now())
ON CONFLICT (id) DO UPDATE SET release_name = EXCLUDED.release_name, updated_at = now();""")
lines.append('')

# 2. Clean existing
lines.append('-- 2. Clean existing data for this roadmap')
lines.append(f"DELETE FROM public.roadmap_item_images WHERE roadmap_id = {esc(roadmap_id)};")
lines.append(f"DELETE FROM public.roadmap_items WHERE roadmap_id = {esc(roadmap_id)};")
lines.append(f"DELETE FROM public.roadmap_milestones WHERE roadmap_id = {esc(roadmap_id)};")
lines.append(f"DELETE FROM public.roadmap_user_settings WHERE roadmap_id = {esc(roadmap_id)};")
lines.append(f"DELETE FROM public.roadmap_item_changes WHERE roadmap_id = {esc(roadmap_id)};")
lines.append('')

# 3. Items sorted by depth (FK constraint)
lines.append(f'-- 3. Roadmap items ({len(items)} rows)')
sorted_items = sorted(items, key=lambda x: x.get('depth', 0))
for it in sorted_items:
    cols = 'roadmap_id, item_id, parent_item_id, sort_order, depth, item_type, name, subcategory_type, group_item_type, team_role, status, status_mode, manual_status, progress, start_date, end_date, priority, version, phase_ids, quick_note, created_at, updated_at, assigned_teams, team_statuses, updated_by'
    vals = ', '.join([
        esc(it.get('roadmap_id')),
        esc(it.get('item_id')),
        esc(it.get('parent_item_id')),
        str(it.get('sort_order', 0)),
        str(it.get('depth', 0)),
        esc(it.get('item_type')),
        esc(it.get('name')),
        esc(it.get('subcategory_type')),
        esc(it.get('group_item_type')),
        esc(it.get('team_role')),
        esc(it.get('status')),
        esc(it.get('status_mode')),
        esc(it.get('manual_status')),
        str(it.get('progress', 0)),
        esc(it.get('start_date')),
        esc(it.get('end_date')),
        esc(it.get('priority')),
        esc(it.get('version')),
        esc_jsonb(it.get('phase_ids', [])),
        esc(it.get('quick_note')),
        esc(it.get('created_at')),
        esc(it.get('updated_at')),
        esc_jsonb(it.get('assigned_teams')),
        esc_jsonb(it.get('team_statuses')),
        esc(it.get('updated_by')),
    ])
    lines.append(f'INSERT INTO public.roadmap_items ({cols}) VALUES ({vals});')
lines.append('')

# 4. Milestones
if milestones:
    lines.append(f'-- 4. Milestones ({len(milestones)} rows)')
    for m in milestones:
        lines.append(f"""INSERT INTO public.roadmap_milestones (roadmap_id, milestone_id, sort_order, label, start_date, end_date, color)
VALUES ({esc(m['roadmap_id'])}, {esc(m['milestone_id'])}, {m.get('sort_order',0)}, {esc(m.get('label',''))}, {esc(m.get('start_date',''))}, {esc(m.get('end_date',''))}, {esc(m.get('color','#3b82f6'))});""")
    lines.append('')

# 5. Images
if images:
    lines.append(f'-- 5. Images ({len(images)} rows)')
    for img in images:
        lines.append(f"""INSERT INTO public.roadmap_item_images (roadmap_id, item_id, image_id, sort_order, image_url, image_name, provider, updated_at)
VALUES ({esc(img['roadmap_id'])}, {esc(img['item_id'])}, {esc(img['image_id'])}, {img.get('sort_order',0)}, {esc(img.get('image_url'))}, {esc(img.get('image_name'))}, {esc(img.get('provider'))}, {esc(img.get('updated_at'))});""")
    lines.append('')

# 6. User settings
if user_settings:
    lines.append(f'-- 6. User settings ({len(user_settings)} rows)')
    for us in user_settings:
        lines.append(f"""INSERT INTO public.roadmap_user_settings (roadmap_id, user_scope, settings, updated_at)
VALUES ({esc(us['roadmap_id'])}, {esc(us['user_scope'])}, {esc_jsonb(us.get('settings',{}))}, {esc(us.get('updated_at'))})
ON CONFLICT (roadmap_id, user_scope) DO UPDATE SET settings = EXCLUDED.settings;""")
    lines.append('')

# 7. Team members (only known columns to avoid schema mismatch)
if team_members:
    known_cols = ['id', 'email', 'role', 'team', 'label', 'is_active', 'created_at']
    lines.append(f'-- 7. Team members ({len(team_members)} rows)')
    for tm in team_members:
        cols_list = [c for c in known_cols if c in tm]
        vals_list = []
        for c in cols_list:
            v = tm[c]
            if isinstance(v, (dict, list)):
                vals_list.append(esc_jsonb(v))
            else:
                vals_list.append(esc(v))
        lines.append(f"INSERT INTO public.team_members ({', '.join(cols_list)}) VALUES ({', '.join(vals_list)}) ON CONFLICT DO NOTHING;")
    lines.append('')

# 8. Audit log
with open(f'{tmpdir}/changes.json') as f: changes = json.load(f)
if changes:
    lines.append(f'-- 8. Audit log ({len(changes)} rows)')
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

lines.append('COMMIT;')

with open(output_file, 'w') as f:
    f.write('\n'.join(lines))

print(f'  -> Written to {output_file}')
PYEOF

echo ""
echo "=========================================="
echo "  SQL file ready: ${OUTPUT_FILE}"
echo "=========================================="
echo ""
echo "To import into local Supabase, run:"
echo ""
echo "  docker exec -i ${LOCAL_CONTAINER} psql -U postgres -d postgres < ${OUTPUT_FILE}"
echo ""
