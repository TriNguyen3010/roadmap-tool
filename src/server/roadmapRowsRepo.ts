/**
 * Repository layer for roadmap storage.
 *
 * Supports two storage modes:
 *   - 'json'  : legacy — reads/writes roadmap_data.content (single JSON blob)
 *   - 'table' : new — reads/writes normalized tables (roadmap_items, etc.)
 *
 * Use getStorageMode(roadmapId) to determine which mode a roadmap uses.
 */

import { supabase } from '@/lib/supabase';
import type { RoadmapDocument, ItemStatus } from '@/types/roadmap';
import type {
    RoadmapRowRecord,
    RoadmapItemRowRecord,
    RoadmapMilestoneRowRecord,
    RoadmapItemImageRowRecord,
    NormalizedRoadmapReadModel,
    NormalizedRoadmapRows,
} from '@/types/roadmapRows';
import { inflateRoadmapDocumentFromRows, flattenRoadmapDocumentToRows } from '@/utils/roadmapRows';

// ─── Storage mode routing ────────────────────────────────────────────────────

export type StorageMode = 'json' | 'table';

/**
 * Determine the storage mode for a roadmap.
 * Returns 'json' for legacy roadmaps, 'table' for new ones.
 * Defaults to 'json' if roadmap not found (safe fallback for existing data).
 */
export async function getStorageMode(roadmapId: string): Promise<StorageMode> {
    const { data } = await supabase
        .from('roadmaps')
        .select('storage_mode')
        .eq('id', roadmapId)
        .maybeSingle();
    return (data?.storage_mode as StorageMode) || 'json';
}

// ─── Column name mapping (camelCase TS → snake_case DB) ──────────────────────

function mapItemRowToDb(row: RoadmapItemRowRecord): Record<string, unknown> {
    return {
        roadmap_id: row.roadmapId,
        item_id: row.itemId,
        parent_item_id: row.parentItemId ?? null,
        sort_order: row.sortOrder,
        depth: row.depth,
        item_type: row.itemType,
        name: row.name,
        subcategory_type: row.subcategoryType ?? null,
        group_item_type: row.groupItemType ?? null,
        team_role: row.teamRole ?? null,
        status: row.status,
        status_mode: row.statusMode ?? null,
        manual_status: row.manualStatus ?? null,
        progress: row.progress,
        start_date: row.startDate ?? null,
        end_date: row.endDate ?? null,
        priority: row.priority ?? null,
        phase_ids: row.phaseIds ?? [],
        quick_note: row.quickNote ?? null,
        created_at: row.createdAt ?? null,
        updated_at: row.updatedAt ?? null,
    };
}

function mapDbRowToItem(row: Record<string, unknown>): RoadmapItemRowRecord {
    return {
        roadmapId: row.roadmap_id as string,
        itemId: row.item_id as string,
        parentItemId: (row.parent_item_id as string) ?? undefined,
        sortOrder: row.sort_order as number,
        depth: row.depth as number,
        itemType: row.item_type as RoadmapItemRowRecord['itemType'],
        name: row.name as string,
        subcategoryType: (row.subcategory_type as RoadmapItemRowRecord['subcategoryType']) ?? undefined,
        groupItemType: (row.group_item_type as RoadmapItemRowRecord['groupItemType']) ?? undefined,
        teamRole: (row.team_role as RoadmapItemRowRecord['teamRole']) ?? undefined,
        status: row.status as ItemStatus,
        statusMode: (row.status_mode as RoadmapItemRowRecord['statusMode']) ?? undefined,
        manualStatus: (row.manual_status as ItemStatus) ?? undefined,
        progress: Number(row.progress) || 0,
        startDate: (row.start_date as string) ?? undefined,
        endDate: (row.end_date as string) ?? undefined,
        priority: (row.priority as RoadmapItemRowRecord['priority']) ?? undefined,
        phaseIds: (row.phase_ids as string[]) ?? [],
        quickNote: (row.quick_note as string) ?? undefined,
        createdAt: (row.created_at as string) ?? undefined,
        updatedAt: (row.updated_at as string) ?? undefined,
    };
}

function mapDbRowToMilestone(row: Record<string, unknown>): RoadmapMilestoneRowRecord {
    return {
        roadmapId: row.roadmap_id as string,
        milestoneId: row.milestone_id as string,
        sortOrder: row.sort_order as number,
        label: row.label as string,
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        color: row.color as string,
    };
}

function mapDbRowToImage(row: Record<string, unknown>): RoadmapItemImageRowRecord {
    return {
        roadmapId: row.roadmap_id as string,
        itemId: row.item_id as string,
        imageId: row.image_id as string,
        sortOrder: row.sort_order as number,
        url: row.image_url as string,
        name: (row.image_name as string) ?? undefined,
        provider: (row.provider as 'cloudinary') ?? undefined,
        updatedAt: (row.updated_at as string) ?? undefined,
    };
}

function mapDbRowToRoadmap(row: Record<string, unknown>): RoadmapRowRecord {
    return {
        id: row.id as string,
        releaseName: row.release_name as string,
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        sourceVersion: (row.source_version as string) ?? undefined,
    };
}

// ─── READ operations ─────────────────────────────────────────────────────────

export async function loadRoadmapDocumentFromRows(roadmapId: string): Promise<RoadmapDocument | null> {
    const readModel = await loadRoadmapReadModel(roadmapId);
    if (!readModel) return null;
    return inflateRoadmapDocumentFromRows(readModel);
}

export async function loadRoadmapReadModel(roadmapId: string): Promise<NormalizedRoadmapReadModel | null> {
    const [roadmapRes, itemsRes, milestonesRes, imagesRes] = await Promise.all([
        supabase.from('roadmaps').select('*').eq('id', roadmapId).single(),
        supabase.from('roadmap_items').select('*').eq('roadmap_id', roadmapId).order('depth').order('sort_order'),
        supabase.from('roadmap_milestones').select('*').eq('roadmap_id', roadmapId).order('sort_order'),
        supabase.from('roadmap_item_images').select('*').eq('roadmap_id', roadmapId).order('item_id').order('sort_order'),
    ]);

    if (roadmapRes.error || !roadmapRes.data) return null;

    return {
        roadmap: mapDbRowToRoadmap(roadmapRes.data),
        items: (itemsRes.data || []).map(mapDbRowToItem),
        milestones: (milestonesRes.data || []).map(mapDbRowToMilestone),
        itemImages: (imagesRes.data || []).map(mapDbRowToImage),
    };
}

export async function loadRoadmapVersion(roadmapId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('roadmaps')
        .select('updated_at')
        .eq('id', roadmapId)
        .single();
    if (error || !data) return null;
    return data.updated_at as string;
}

export async function loadItemRows(
    roadmapId: string,
    itemIds: string[]
): Promise<RoadmapItemRowRecord[]> {
    if (itemIds.length === 0) return [];
    const { data, error } = await supabase
        .from('roadmap_items')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .in('item_id', itemIds);
    if (error || !data) return [];
    return data.map(mapDbRowToItem);
}

export async function loadItemWithAncestors(
    roadmapId: string,
    itemId: string
): Promise<RoadmapItemRowRecord[]> {
    const chain: RoadmapItemRowRecord[] = [];
    let currentId: string | null = itemId;

    while (currentId) {
        const rows = await loadItemRows(roadmapId, [currentId]);
        if (rows.length === 0) break;
        chain.push(rows[0]);
        currentId = rows[0].parentItemId ?? null;
    }

    return chain;
}

export async function loadDirectChildren(
    roadmapId: string,
    parentItemId: string | null
): Promise<RoadmapItemRowRecord[]> {
    let query = supabase
        .from('roadmap_items')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .order('sort_order');

    if (parentItemId === null) {
        query = query.is('parent_item_id', null);
    } else {
        query = query.eq('parent_item_id', parentItemId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbRowToItem);
}

// ─── WRITE operations ────────────────────────────────────────────────────────

export interface ItemFieldPatch {
    status?: ItemStatus;
    startDate?: string | null;
    endDate?: string | null;
    quickNote?: string | null;
    statusMode?: string;
    manualStatus?: ItemStatus | null;
    progress?: number;
}

export async function updateItemFields(
    roadmapId: string,
    itemId: string,
    fields: ItemFieldPatch
): Promise<{ success: boolean; error?: string }> {
    const dbFields: Record<string, unknown> = {};
    if (fields.status !== undefined) dbFields.status = fields.status;
    if (fields.startDate !== undefined) dbFields.start_date = fields.startDate;
    if (fields.endDate !== undefined) dbFields.end_date = fields.endDate;
    if (fields.quickNote !== undefined) dbFields.quick_note = fields.quickNote;
    if (fields.statusMode !== undefined) dbFields.status_mode = fields.statusMode;
    if (fields.manualStatus !== undefined) dbFields.manual_status = fields.manualStatus;
    if (fields.progress !== undefined) dbFields.progress = fields.progress;
    dbFields.updated_at = new Date().toISOString();

    const { error } = await supabase
        .from('roadmap_items')
        .update(dbFields)
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ─── ADMIN: Full document sync (diff-based) ─────────────────────────────────

export interface RowDiff {
    inserts: RoadmapItemRowRecord[];
    updates: { itemId: string; fields: Record<string, unknown> }[];
    deletes: string[]; // itemIds to delete
}

export function diffRoadmapRows(
    currentRows: RoadmapItemRowRecord[],
    nextRows: RoadmapItemRowRecord[]
): RowDiff {
    const currentMap = new Map(currentRows.map(r => [r.itemId, r]));
    const nextMap = new Map(nextRows.map(r => [r.itemId, r]));

    const inserts: RoadmapItemRowRecord[] = [];
    const updates: RowDiff['updates'] = [];
    const deletes: string[] = [];

    // Find inserts and updates
    for (const [itemId, nextRow] of nextMap) {
        const currentRow = currentMap.get(itemId);
        if (!currentRow) {
            inserts.push(nextRow);
        } else {
            const changes = diffSingleRow(currentRow, nextRow);
            if (Object.keys(changes).length > 0) {
                updates.push({ itemId, fields: changes });
            }
        }
    }

    // Find deletes
    for (const [itemId] of currentMap) {
        if (!nextMap.has(itemId)) {
            deletes.push(itemId);
        }
    }

    return { inserts, updates, deletes };
}

function diffSingleRow(
    current: RoadmapItemRowRecord,
    next: RoadmapItemRowRecord
): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const dbCurrent = mapItemRowToDb(current);
    const dbNext = mapItemRowToDb(next);

    for (const key of Object.keys(dbNext)) {
        if (key === 'roadmap_id' || key === 'item_id') continue;
        const a = dbCurrent[key];
        const b = dbNext[key];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            changes[key] = b;
        }
    }

    return changes;
}

export async function fullDocumentSync(
    roadmapId: string,
    document: RoadmapDocument,
    changedByEmail?: string
): Promise<{ success: boolean; updatedAt: string; error?: string }> {
    const now = new Date().toISOString();

    // 1. Flatten incoming document to rows
    const nextSnapshot = flattenRoadmapDocumentToRows(roadmapId, document, now);

    // 2. Load current rows from DB
    const currentModel = await loadRoadmapReadModel(roadmapId);

    // 3. Update roadmaps metadata
    const { error: metaError } = await supabase
        .from('roadmaps')
        .upsert({
            id: roadmapId,
            release_name: document.releaseName || 'Untitled Roadmap',
            start_date: document.startDate || '',
            end_date: document.endDate || '',
            updated_at: now,
        });
    if (metaError) return { success: false, updatedAt: '', error: metaError.message };

    // 4. Replace milestones (simple: delete all + re-insert)
    await supabase.from('roadmap_milestones').delete().eq('roadmap_id', roadmapId);
    if (nextSnapshot.milestones.length > 0) {
        const { error: msError } = await supabase
            .from('roadmap_milestones')
            .insert(nextSnapshot.milestones.map(m => ({
                roadmap_id: m.roadmapId,
                milestone_id: m.milestoneId,
                sort_order: m.sortOrder,
                label: m.label,
                start_date: m.startDate,
                end_date: m.endDate,
                color: m.color,
                updated_at: now,
            })));
        if (msError) return { success: false, updatedAt: '', error: msError.message };
    }

    // 5. Replace images (simple: delete all + re-insert)
    await supabase.from('roadmap_item_images').delete().eq('roadmap_id', roadmapId);
    if (nextSnapshot.itemImages.length > 0) {
        const { error: imgError } = await supabase
            .from('roadmap_item_images')
            .insert(nextSnapshot.itemImages.map(img => ({
                roadmap_id: img.roadmapId,
                item_id: img.itemId,
                image_id: img.imageId,
                sort_order: img.sortOrder,
                image_url: img.url,
                image_name: img.name ?? null,
                provider: img.provider ?? null,
                updated_at: img.updatedAt ?? null,
            })));
        if (imgError) return { success: false, updatedAt: '', error: imgError.message };
    }

    // 6. Diff items and apply
    const currentItems = currentModel?.items ?? [];
    const diff = diffRoadmapRows(currentItems, nextSnapshot.items);

    // Delete removed items (children first — sort by depth desc)
    if (diff.deletes.length > 0) {
        // Must delete in reverse depth order to respect FK constraints
        const deleteRows = currentItems.filter(r => diff.deletes.includes(r.itemId));
        deleteRows.sort((a, b) => b.depth - a.depth);
        for (const row of deleteRows) {
            await supabase
                .from('roadmap_items')
                .delete()
                .eq('roadmap_id', roadmapId)
                .eq('item_id', row.itemId);
        }
    }

    // Insert new items (parents first — sort by depth asc)
    if (diff.inserts.length > 0) {
        const sortedInserts = [...diff.inserts].sort((a, b) => a.depth - b.depth);
        for (const row of sortedInserts) {
            const dbRow = mapItemRowToDb(row);
            dbRow.updated_at = now;
            const { error: insError } = await supabase
                .from('roadmap_items')
                .insert(dbRow);
            if (insError) return { success: false, updatedAt: '', error: `Insert ${row.itemId}: ${insError.message}` };
        }
    }

    // Update changed items
    for (const upd of diff.updates) {
        upd.fields.updated_at = now;
        const { error: updError } = await supabase
            .from('roadmap_items')
            .update(upd.fields)
            .eq('roadmap_id', roadmapId)
            .eq('item_id', upd.itemId);
        if (updError) return { success: false, updatedAt: '', error: `Update ${upd.itemId}: ${updError.message}` };
    }

    // 6b. Write changelog for updated items (field-level audit)
    if (changedByEmail && diff.updates.length > 0) {
        const currentMap = new Map(currentItems.map(r => [r.itemId, r]));
        const nextMap = new Map(nextSnapshot.items.map(r => [r.itemId, r]));
        const changeRecords: InsertItemChangeInput[] = [];

        // DB column → camelCase field name mapping for tracked fields
        const TRACKED_DB_FIELDS: Record<string, string> = {
            status: 'status',
            start_date: 'startDate',
            end_date: 'endDate',
            quick_note: 'quickNote',
        };

        for (const upd of diff.updates) {
            const currentRow = currentMap.get(upd.itemId);
            const nextRow = nextMap.get(upd.itemId);
            if (!currentRow || !nextRow) continue;

            // Resolve team from item or ancestor chain
            const team = nextRow.teamRole ?? currentRow.teamRole ?? null;

            for (const [dbCol, fieldName] of Object.entries(TRACKED_DB_FIELDS)) {
                if (!(dbCol in upd.fields)) continue;
                const oldVal = (currentRow as unknown as Record<string, unknown>)[fieldName];
                const newVal = (nextRow as unknown as Record<string, unknown>)[fieldName];
                const oldStr = oldVal != null ? String(oldVal) : null;
                const newStr = newVal != null ? String(newVal) : null;
                if (oldStr !== newStr) {
                    changeRecords.push({
                        itemId: upd.itemId,
                        team,
                        field: fieldName,
                        oldValue: oldStr,
                        newValue: newStr,
                        changedBy: changedByEmail,
                    });
                }
            }
        }

        if (changeRecords.length > 0) {
            await insertItemChanges(roadmapId, changeRecords);
        }
    }

    // 7. Regenerate JSON blob as backup
    await regenerateJsonBlob(roadmapId);

    return { success: true, updatedAt: now };
}

// ─── Change tracking (audit log) ────────────────────────────────────────────

export interface ItemChangeRecord {
    id: string;
    roadmapId: string;
    itemId: string;
    team: string | null;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedAt: string;
}

export interface InsertItemChangeInput {
    itemId: string;
    team: string | null;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
}

/**
 * Insert a single change record into roadmap_item_changes.
 */
export async function insertItemChange(
    roadmapId: string,
    change: InsertItemChangeInput
): Promise<void> {
    await supabase.from('roadmap_item_changes').insert({
        roadmap_id: roadmapId,
        item_id: change.itemId,
        team: change.team,
        field: change.field,
        old_value: change.oldValue,
        new_value: change.newValue,
        changed_by: change.changedBy,
    });
}

/**
 * Insert multiple change records in a single batch.
 */
export async function insertItemChanges(
    roadmapId: string,
    changes: InsertItemChangeInput[]
): Promise<void> {
    if (changes.length === 0) return;
    await supabase.from('roadmap_item_changes').insert(
        changes.map(c => ({
            roadmap_id: roadmapId,
            item_id: c.itemId,
            team: c.team,
            field: c.field,
            old_value: c.oldValue,
            new_value: c.newValue,
            changed_by: c.changedBy,
        }))
    );
}

function mapDbRowToChange(row: Record<string, unknown>): ItemChangeRecord {
    return {
        id: row.id as string,
        roadmapId: row.roadmap_id as string,
        itemId: row.item_id as string,
        team: (row.team as string) ?? null,
        field: row.field as string,
        oldValue: (row.old_value as string) ?? null,
        newValue: (row.new_value as string) ?? null,
        changedBy: row.changed_by as string,
        changedAt: row.changed_at as string,
    };
}

/**
 * Load the latest change per (team, field) for an item.
 * Only returns changes for the 3 key fields: status, startDate, endDate.
 * Used for the compact default view in EditPopup.
 */
export async function loadLatestChanges(
    roadmapId: string,
    itemId: string
): Promise<ItemChangeRecord[]> {
    // Supabase doesn't support DISTINCT ON directly.
    // Use a raw RPC or fetch recent rows and deduplicate in JS.
    const { data, error } = await supabase
        .from('roadmap_item_changes')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId)
        .in('field', ['status', 'startDate', 'endDate'])
        .order('changed_at', { ascending: false })
        .limit(100); // fetch enough to cover all team×field combos

    if (error || !data) return [];

    // Deduplicate: keep only the latest per (team, field)
    const seen = new Set<string>();
    const result: ItemChangeRecord[] = [];
    for (const row of data) {
        const key = `${row.team ?? ''}::${row.field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(mapDbRowToChange(row));
    }

    return result;
}

/**
 * Load full paginated change history for an item.
 * Supports filtering by team.
 */
export async function loadChangeHistory(
    roadmapId: string,
    itemId: string,
    options?: { limit?: number; offset?: number; team?: string }
): Promise<{ changes: ItemChangeRecord[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    let query = supabase
        .from('roadmap_item_changes')
        .select('*', { count: 'exact' })
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId)
        .order('changed_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (options?.team) {
        query = query.eq('team', options.team);
    }

    const { data, error, count } = await query;
    if (error || !data) return { changes: [], total: 0 };

    return {
        changes: data.map(mapDbRowToChange),
        total: count ?? 0,
    };
}

// ─── Reverse dual-write: rows → JSON blob backup ────────────────────────────

export async function regenerateJsonBlob(roadmapId: string): Promise<void> {
    const document = await loadRoadmapDocumentFromRows(roadmapId);
    if (!document) return;

    // Use RPC to set the skip flag within the same transaction
    // so the forward dual-write trigger is skipped
    await supabase.rpc('regenerate_roadmap_json_blob', {
        p_roadmap_id: roadmapId,
        p_content: document,
    });
}
