/**
 * Repository layer for roadmap storage.
 *
 * Supports two storage modes:
 *   - 'json'  : legacy — reads/writes roadmap_data.content (single JSON blob)
 *   - 'table' : new — reads/writes normalized tables (roadmap_items, etc.)
 *
 * Use getStorageMode(roadmapId) to determine which mode a roadmap uses.
 */

import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import type { RoadmapDocument, ItemStatus, RoadmapConfig, RoadmapItem } from '@/types/roadmap';
import { DEFAULT_ROADMAP_CONFIG, normalizeItemImages, normalizePhaseIds } from '@/types/roadmap';
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
        version: row.version ?? null,
        extra: row.extra ?? {},
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
        version: (row.version as string) ?? undefined,
        extra: (row.extra as Record<string, string>) ?? undefined,
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

function parseRoadmapConfig(raw: unknown): RoadmapConfig {
    if (!raw || typeof raw !== 'object') return DEFAULT_ROADMAP_CONFIG;
    const obj = raw as Record<string, unknown>;
    const hasRoles = Array.isArray(obj.teamRoles) && obj.teamRoles.length > 0;
    if (!hasRoles) return DEFAULT_ROADMAP_CONFIG;
    const config: RoadmapConfig = {
        teamRoles: obj.teamRoles as string[],
        teamStatuses: (obj.teamStatuses as Record<string, string[]>) || DEFAULT_ROADMAP_CONFIG.teamStatuses,
        taskStatuses: Array.isArray(obj.taskStatuses) ? obj.taskStatuses as string[] : DEFAULT_ROADMAP_CONFIG.taskStatuses,
    };
    if (Array.isArray(obj.columns) && obj.columns.length > 0) {
        config.columns = (obj.columns as Record<string, unknown>[]).map(col => ({
            key: String(col.key ?? ''),
            label: String(col.label ?? ''),
            ...(col.width ? { width: Number(col.width) } : {}),
            ...(col.type === 'text' || col.type === 'dropdown' ? { type: col.type as 'text' | 'dropdown' } : {}),
            ...(Array.isArray(col.options) ? { options: col.options as string[] } : {}),
            ...(col.position === 'after-status' || col.position === 'after-end-date' ? { position: col.position as 'after-status' | 'after-end-date' } : {}),
        })).filter(col => col.key && col.label);
    }
    return config;
}

function mapDbRowToRoadmap(row: Record<string, unknown>): RoadmapRowRecord {
    return {
        id: row.id as string,
        releaseName: row.release_name as string,
        startDate: row.start_date as string,
        endDate: row.end_date as string,
        sourceVersion: (row.source_version as string) ?? undefined,
        config: parseRoadmapConfig(row.config),
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

export async function loadRoadmapConfig(roadmapId: string): Promise<RoadmapConfig> {
    const { data } = await supabase
        .from('roadmaps')
        .select('config')
        .eq('id', roadmapId)
        .maybeSingle();
    return parseRoadmapConfig(data?.config);
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

/**
 * Bump roadmaps.updated_at to now(). Call this after any row-level mutation
 * (updateItemFields / insertItemSubtree / deleteItemSubtree / moveItem) so
 * that the /version endpoint and future baseVersion checks reflect the latest
 * edit. Without this, roadmaps.updated_at stays stale relative to actual row
 * changes and baseVersion CAS becomes inconsistent with /version.
 */
export async function bumpRoadmapTimestamp(roadmapId: string): Promise<string> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('roadmaps')
        .update({ updated_at: now })
        .eq('id', roadmapId);
    if (error) {
        console.error('[bumpRoadmapTimestamp] failed:', error.message);
    }
    return now;
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
    // Manager-editable fields
    status?: ItemStatus;
    startDate?: string | null;
    endDate?: string | null;
    quickNote?: string | null;
    statusMode?: string;
    manualStatus?: ItemStatus | null;
    progress?: number;
    // Admin-only fields
    name?: string;
    priority?: string | null;
    version?: string | null;
    groupItemType?: string | null;
    phaseIds?: string[];
    extra?: Record<string, string>;
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
    if (fields.name !== undefined) dbFields.name = fields.name;
    if (fields.priority !== undefined) dbFields.priority = fields.priority;
    if (fields.version !== undefined) dbFields.version = fields.version;
    if (fields.groupItemType !== undefined) dbFields.group_item_type = fields.groupItemType;
    if (fields.phaseIds !== undefined) dbFields.phase_ids = fields.phaseIds;
    if (fields.extra !== undefined) dbFields.extra = fields.extra;
    dbFields.updated_at = new Date().toISOString();

    const { error } = await supabase
        .from('roadmap_items')
        .update(dbFields)
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ─── Structure ops (row-level add / delete / move) ─────────────────────────

/**
 * Flatten a RoadmapItem subtree into row records.
 * The root item receives (parentItemId, sortOrder, depth) from the caller; each
 * descendant's depth/sortOrder is derived from its position within its parent.
 */
function flattenItemSubtreeToRows(
    roadmapId: string,
    item: RoadmapItem,
    parentItemId: string | null,
    rootSortOrder: number,
    rootDepth: number,
    now: string,
): { items: RoadmapItemRowRecord[]; images: RoadmapItemImageRowRecord[] } {
    const items: RoadmapItemRowRecord[] = [];
    const images: RoadmapItemImageRowRecord[] = [];

    const walk = (
        node: RoadmapItem,
        nodeParentId: string | null,
        nodeSortOrder: number,
        nodeDepth: number,
    ) => {
        items.push({
            roadmapId,
            itemId: node.id,
            parentItemId: nodeParentId ?? undefined,
            sortOrder: nodeSortOrder,
            depth: nodeDepth,
            itemType: node.type,
            name: node.name,
            subcategoryType: node.subcategoryType,
            groupItemType: node.groupItemType,
            teamRole: node.teamRole,
            status: node.status,
            statusMode: node.statusMode,
            manualStatus: node.manualStatus,
            progress: Number(node.progress) || 0,
            startDate: node.startDate,
            endDate: node.endDate,
            priority: node.priority,
            version: node.version,
            extra: node.extra,
            phaseIds: normalizePhaseIds(node.phaseIds),
            quickNote: node.quickNote,
            createdAt: node.created_at ?? now,
            updatedAt: node.updated_at ?? now,
        });

        const nodeImages = normalizeItemImages(node);
        nodeImages.forEach((image, imageIndex) => {
            images.push({
                roadmapId,
                itemId: node.id,
                imageId: image.id,
                sortOrder: imageIndex,
                url: image.url,
                name: image.name,
                provider: image.provider,
                updatedAt: image.updatedAt ?? now,
            });
        });

        (node.children ?? []).forEach((child, childIndex) => {
            walk(child, node.id, childIndex, nodeDepth + 1);
        });
    };

    walk(item, parentItemId, rootSortOrder, rootDepth);
    return { items, images };
}

async function shiftSiblingsUp(
    roadmapId: string,
    parentItemId: string | null,
    fromIndex: number,
): Promise<{ success: boolean; error?: string }> {
    // Bump sort_order by 1 for siblings with sort_order >= fromIndex.
    // Load affected rows, then update each (Supabase doesn't support SQL-arith in .update()).
    let query = supabase
        .from('roadmap_items')
        .select('item_id, sort_order')
        .eq('roadmap_id', roadmapId)
        .gte('sort_order', fromIndex);
    query = parentItemId === null
        ? query.is('parent_item_id', null)
        : query.eq('parent_item_id', parentItemId);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    // Update from highest to lowest to avoid transient unique-constraint issues
    // (if a unique index on (parent_item_id, sort_order) ever exists).
    const rows = (data ?? [])
        .map(r => ({ itemId: r.item_id as string, sortOrder: r.sort_order as number }))
        .sort((a, b) => b.sortOrder - a.sortOrder);

    for (const row of rows) {
        const { error: updError } = await supabase
            .from('roadmap_items')
            .update({ sort_order: row.sortOrder + 1 })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', row.itemId);
        if (updError) return { success: false, error: updError.message };
    }
    return { success: true };
}

async function shiftSiblingsDown(
    roadmapId: string,
    parentItemId: string | null,
    fromIndex: number,
): Promise<{ success: boolean; error?: string }> {
    // Decrement sort_order by 1 for siblings with sort_order > fromIndex.
    let query = supabase
        .from('roadmap_items')
        .select('item_id, sort_order')
        .eq('roadmap_id', roadmapId)
        .gt('sort_order', fromIndex);
    query = parentItemId === null
        ? query.is('parent_item_id', null)
        : query.eq('parent_item_id', parentItemId);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? [])
        .map(r => ({ itemId: r.item_id as string, sortOrder: r.sort_order as number }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const row of rows) {
        const { error: updError } = await supabase
            .from('roadmap_items')
            .update({ sort_order: row.sortOrder - 1 })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', row.itemId);
        if (updError) return { success: false, error: updError.message };
    }
    return { success: true };
}

/**
 * Insert a new item subtree at (parentItemId, insertIndex).
 * Shifts existing siblings at positions >= insertIndex down by 1.
 */
export async function insertItemSubtree(
    roadmapId: string,
    parentItemId: string | null,
    insertIndex: number,
    item: RoadmapItem,
): Promise<{ success: boolean; error?: string }> {
    // Determine depth from parent
    let rootDepth = 0;
    if (parentItemId) {
        const { data: parentRow, error: parentErr } = await supabase
            .from('roadmap_items')
            .select('depth')
            .eq('roadmap_id', roadmapId)
            .eq('item_id', parentItemId)
            .maybeSingle();
        if (parentErr) return { success: false, error: parentErr.message };
        if (!parentRow) return { success: false, error: `Parent item "${parentItemId}" not found` };
        rootDepth = (parentRow.depth as number) + 1;
    }

    // Shift siblings to open up slot at insertIndex
    const shift = await shiftSiblingsUp(roadmapId, parentItemId, insertIndex);
    if (!shift.success) return shift;

    // Flatten subtree and insert rows parents-first
    const now = new Date().toISOString();
    const { items, images } = flattenItemSubtreeToRows(
        roadmapId,
        item,
        parentItemId,
        insertIndex,
        rootDepth,
        now,
    );

    const sortedItems = [...items].sort((a, b) => a.depth - b.depth);
    for (const row of sortedItems) {
        const dbRow = mapItemRowToDb(row);
        dbRow.updated_at = now;
        const { error } = await supabase.from('roadmap_items').insert(dbRow);
        if (error) return { success: false, error: `Insert ${row.itemId}: ${error.message}` };
    }

    if (images.length > 0) {
        const { error: imgErr } = await supabase
            .from('roadmap_item_images')
            .insert(images.map(img => ({
                roadmap_id: img.roadmapId,
                item_id: img.itemId,
                image_id: img.imageId,
                sort_order: img.sortOrder,
                image_url: img.url,
                image_name: img.name ?? null,
                provider: img.provider ?? null,
                updated_at: img.updatedAt ?? null,
            })));
        if (imgErr) return { success: false, error: `Insert images: ${imgErr.message}` };
    }

    return { success: true };
}

/**
 * Recursively collect all descendant item_ids of a given root.
 * Returns an array including the root itself, ordered deepest-first.
 */
async function collectSubtreeIds(
    roadmapId: string,
    rootItemId: string,
): Promise<{ itemIds: string[]; error?: string }> {
    const result: { itemId: string; depth: number }[] = [];
    let frontier: string[] = [rootItemId];

    // BFS level by level
    while (frontier.length > 0) {
        const { data, error } = await supabase
            .from('roadmap_items')
            .select('item_id, depth, parent_item_id')
            .eq('roadmap_id', roadmapId)
            .in('item_id', frontier);
        if (error) return { itemIds: [], error: error.message };

        for (const row of data ?? []) {
            result.push({ itemId: row.item_id as string, depth: row.depth as number });
        }

        // Find children of this frontier
        const { data: children, error: childErr } = await supabase
            .from('roadmap_items')
            .select('item_id')
            .eq('roadmap_id', roadmapId)
            .in('parent_item_id', frontier);
        if (childErr) return { itemIds: [], error: childErr.message };

        frontier = (children ?? []).map(c => c.item_id as string);
    }

    // Sort deepest-first for FK-safe deletion
    result.sort((a, b) => b.depth - a.depth);
    return { itemIds: result.map(r => r.itemId) };
}

/**
 * Delete an item and its entire subtree.
 * Also collapses sort_order of remaining siblings so positions stay consecutive.
 */
export async function deleteItemSubtree(
    roadmapId: string,
    itemId: string,
): Promise<{ success: boolean; error?: string }> {
    // Load target to know its parent + sort_order (for sibling shift)
    const { data: targetRow, error: targetErr } = await supabase
        .from('roadmap_items')
        .select('parent_item_id, sort_order')
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId)
        .maybeSingle();
    if (targetErr) return { success: false, error: targetErr.message };
    if (!targetRow) return { success: false, error: `Item "${itemId}" not found` };

    const parentItemId = (targetRow.parent_item_id as string | null) ?? null;
    const oldSortOrder = targetRow.sort_order as number;

    // Collect descendant ids (deepest first)
    const { itemIds, error: collectErr } = await collectSubtreeIds(roadmapId, itemId);
    if (collectErr) return { success: false, error: collectErr };

    // Delete images for the subtree (FK-safe: roadmap_item_images → roadmap_items)
    if (itemIds.length > 0) {
        const { error: imgErr } = await supabase
            .from('roadmap_item_images')
            .delete()
            .eq('roadmap_id', roadmapId)
            .in('item_id', itemIds);
        if (imgErr) return { success: false, error: `Delete images: ${imgErr.message}` };
    }

    // Delete items deepest-first (itemIds is already sorted by depth desc)
    for (const id of itemIds) {
        const { error: delErr } = await supabase
            .from('roadmap_items')
            .delete()
            .eq('roadmap_id', roadmapId)
            .eq('item_id', id);
        if (delErr) return { success: false, error: `Delete ${id}: ${delErr.message}` };
    }

    // Collapse sibling gap
    const shift = await shiftSiblingsDown(roadmapId, parentItemId, oldSortOrder);
    if (!shift.success) return shift;

    return { success: true };
}

/**
 * Move an item (with its subtree) to a new parent and/or position.
 * Updates depth for all descendants when depth changes.
 * Rejects moves that would place an item inside its own subtree.
 */
export async function moveItem(
    roadmapId: string,
    itemId: string,
    newParentItemId: string | null,
    newIndex: number,
): Promise<{ success: boolean; error?: string }> {
    // Load moving item
    const { data: movingRow, error: movingErr } = await supabase
        .from('roadmap_items')
        .select('parent_item_id, sort_order, depth')
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId)
        .maybeSingle();
    if (movingErr) return { success: false, error: movingErr.message };
    if (!movingRow) return { success: false, error: `Item "${itemId}" not found` };

    const oldParentId = (movingRow.parent_item_id as string | null) ?? null;
    const oldSortOrder = movingRow.sort_order as number;
    const oldDepth = movingRow.depth as number;

    // Determine new depth (reject self-cycle)
    let newDepth = 0;
    if (newParentItemId) {
        if (newParentItemId === itemId) {
            return { success: false, error: 'Cannot move item into itself' };
        }
        const { itemIds: subtreeIds, error: subtreeErr } = await collectSubtreeIds(roadmapId, itemId);
        if (subtreeErr) return { success: false, error: subtreeErr };
        if (subtreeIds.includes(newParentItemId)) {
            return { success: false, error: 'Cannot move item into its own descendant' };
        }

        const { data: parentRow, error: parentErr } = await supabase
            .from('roadmap_items')
            .select('depth')
            .eq('roadmap_id', roadmapId)
            .eq('item_id', newParentItemId)
            .maybeSingle();
        if (parentErr) return { success: false, error: parentErr.message };
        if (!parentRow) return { success: false, error: `New parent "${newParentItemId}" not found` };
        newDepth = (parentRow.depth as number) + 1;
    }

    const depthDelta = newDepth - oldDepth;

    // Step 1: temporarily park moving item at sort_order = -1 so it doesn't
    // interfere with sibling shifts. (Using negative keeps it out of range.)
    {
        const { error } = await supabase
            .from('roadmap_items')
            .update({ sort_order: -1 })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', itemId);
        if (error) return { success: false, error: `Park moving item: ${error.message}` };
    }

    // Step 2: collapse old parent gap (shifts siblings with sort > oldSort down
    // by 1). Caller passes newIndex already adjusted to the post-removal array
    // (it's derived via findItemLocation on the reordered tree), so no further
    // correction is needed — newIndex IS the final slot.
    const downShift = await shiftSiblingsDown(roadmapId, oldParentId, oldSortOrder);
    if (!downShift.success) return downShift;

    // Step 3: open slot at new position
    const upShift = await shiftSiblingsUp(roadmapId, newParentItemId, newIndex);
    if (!upShift.success) return upShift;

    // Step 4: place moving item at target position + update depth
    {
        const { error } = await supabase
            .from('roadmap_items')
            .update({
                parent_item_id: newParentItemId,
                sort_order: newIndex,
                depth: newDepth,
                updated_at: new Date().toISOString(),
            })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', itemId);
        if (error) return { success: false, error: `Update moving item: ${error.message}` };
    }

    // Step 5: update depth of all descendants if depth changed
    if (depthDelta !== 0) {
        const { itemIds: subtreeIds, error: subtreeErr } = await collectSubtreeIds(roadmapId, itemId);
        if (subtreeErr) return { success: false, error: subtreeErr };
        // Exclude the moving item itself (already updated above)
        const descendantIds = subtreeIds.filter(id => id !== itemId);
        for (const descId of descendantIds) {
            const { data: row, error: readErr } = await supabase
                .from('roadmap_items')
                .select('depth')
                .eq('roadmap_id', roadmapId)
                .eq('item_id', descId)
                .maybeSingle();
            if (readErr || !row) continue;
            const { error: updErr } = await supabase
                .from('roadmap_items')
                .update({ depth: (row.depth as number) + depthDelta })
                .eq('roadmap_id', roadmapId)
                .eq('item_id', descId);
            if (updErr) return { success: false, error: `Update descendant depth: ${updErr.message}` };
        }
    }

    return { success: true };
}

/**
 * Convert an item between `group` and `subcategory` type while simultaneously
 * re-parenting it. MVP constraint: the source item MUST be empty (no children)
 * because the target type's hierarchy would otherwise be violated (subcategory
 * can only hold groups, group can only hold items/teams).
 *
 * Validates:
 *  - source exists and item_type matches the expected "before" type
 *    (newType='subcategory' → before='group', and vice versa)
 *  - source has zero children
 *  - new parent exists and has the correct type for the target
 *    (subcategory → parent must be 'category'; group → parent must be 'subcategory')
 *  - self-cycle (newParent === item) rejected for parity with moveItem
 *
 * Applies (same park/shift/place dance as moveItem so CAS-free row updates are
 * safe):
 *  - Park moving item at sort_order = -1
 *  - shiftSiblingsDown on old parent to collapse the gap
 *  - shiftSiblingsUp on new parent to open the slot
 *  - Final update: parent_item_id, sort_order, depth, item_type,
 *    subcategory_type, group_item_type (discriminator swap), updated_at
 *
 * Discriminator mapping:
 *  - group → subcategory:  groupItemType='Improvement' collapses to 'Feature'
 *                          (SubcategoryType has no 'Improvement')
 *  - subcategory → group:  subcategoryType passes through 1:1 (all values
 *                          are valid GroupItemType values)
 */
export async function convertItemType(
    roadmapId: string,
    itemId: string,
    newType: 'subcategory' | 'group',
    newParentItemId: string | null,
    newIndex: number,
): Promise<{ success: boolean; error?: string; userError?: boolean; wrapperId?: string }> {
    // Self-cycle guard parity with moveItem.
    if (newParentItemId === itemId) {
        return { success: false, error: 'Cannot move item into itself', userError: true };
    }

    // 1. Load source — must exist, must have expected old type.
    const { data: sourceRow, error: srcErr } = await supabase
        .from('roadmap_items')
        .select('parent_item_id, sort_order, depth, item_type, subcategory_type, group_item_type')
        .eq('roadmap_id', roadmapId)
        .eq('item_id', itemId)
        .maybeSingle();
    if (srcErr) return { success: false, error: srcErr.message };
    if (!sourceRow) return { success: false, error: `Item "${itemId}" not found`, userError: true };

    const expectedOldType = newType === 'subcategory' ? 'group' : 'subcategory';
    const oldType = sourceRow.item_type as string;
    if (oldType !== expectedOldType) {
        return {
            success: false,
            error: `Item type mismatch: expected "${expectedOldType}", found "${oldType}"`,
            userError: true,
        };
    }

    // 2. Emptiness check — the MVP used to reject ANY non-empty source, but
    //    group → subcategory now has an auto-wrap path (see §4.5 of the
    //    spec). Subcategory → group still requires an empty source because
    //    cascading groups-of-groups is not a valid hierarchy.
    const { count: childCount, error: cntErr } = await supabase
        .from('roadmap_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('roadmap_id', roadmapId)
        .eq('parent_item_id', itemId);
    if (cntErr) return { success: false, error: cntErr.message };
    const sourceHasChildren = (childCount ?? 0) > 0;
    if (sourceHasChildren && newType === 'group') {
        return {
            success: false,
            error: `Cannot demote: item has ${childCount} children. Remove them first.`,
            userError: true,
        };
    }

    // 2a. Wrap path: source is a non-empty group being promoted to
    //     subcategory. Delegate to the atomic RPC; it handles the sibling
    //     shifts, wrapper insertion, child re-parenting, and final retype
    //     in one transaction.
    if (sourceHasChildren && newType === 'subcategory') {
        if (!newParentItemId) {
            return {
                success: false,
                error: `convert-item-type requires a newParentItemId`,
                userError: true,
            };
        }
        const wrapperId = randomUUID();
        const { data, error } = await supabase.rpc(
            'admin_convert_group_with_wrap',
            {
                p_roadmap_id: roadmapId,
                p_item_id: itemId,
                p_new_parent_id: newParentItemId,
                p_new_index: newIndex,
                p_wrapper_id: wrapperId,
            },
        );
        if (error) return { success: false, error: `RPC: ${error.message}` };
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.success) {
            return {
                success: false,
                error: row?.error ?? 'RPC returned no result',
                userError: true,
            };
        }
        return { success: true, wrapperId };
    }

    // 3. New parent validation + depth resolution.
    const expectedParentType = newType === 'subcategory' ? 'category' : 'subcategory';
    let newDepth = 0;
    if (newParentItemId) {
        const { data: parentRow, error: parentErr } = await supabase
            .from('roadmap_items')
            .select('depth, item_type')
            .eq('roadmap_id', roadmapId)
            .eq('item_id', newParentItemId)
            .maybeSingle();
        if (parentErr) return { success: false, error: parentErr.message };
        if (!parentRow) {
            return { success: false, error: `New parent "${newParentItemId}" not found`, userError: true };
        }
        const parentType = parentRow.item_type as string;
        if (parentType !== expectedParentType) {
            return {
                success: false,
                error: `New parent type "${parentType}" is invalid for ${newType} (expected "${expectedParentType}")`,
                userError: true,
            };
        }
        newDepth = (parentRow.depth as number) + 1;
    } else {
        // Root-level (parent null) is allowed only for `category` children in
        // this app. But `subcategory` and `group` both require a concrete
        // parent, so reject.
        return { success: false, error: `convert-item-type requires a newParentItemId`, userError: true };
    }

    // 4. Compute discriminator values for the target type.
    const incomingGroupType = (sourceRow.group_item_type as string | null) ?? null;
    const incomingSubType = (sourceRow.subcategory_type as string | null) ?? null;
    let nextSubcategoryType: string | null = null;
    let nextGroupItemType: string | null = null;
    if (newType === 'subcategory') {
        // Map 'Improvement' → 'Feature'; others pass through.
        nextSubcategoryType = incomingGroupType === 'Improvement' ? 'Feature' : incomingGroupType;
        nextGroupItemType = null;
    } else {
        nextGroupItemType = incomingSubType;
        nextSubcategoryType = null;
    }

    const oldParentId = (sourceRow.parent_item_id as string | null) ?? null;
    const oldSortOrder = sourceRow.sort_order as number;

    // 5. Park at sort_order = -1 so sibling shifts don't collide with us.
    {
        const { error } = await supabase
            .from('roadmap_items')
            .update({ sort_order: -1 })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', itemId);
        if (error) return { success: false, error: `Park moving item: ${error.message}` };
    }

    // 6. Collapse old parent, open new parent.
    const downShift = await shiftSiblingsDown(roadmapId, oldParentId, oldSortOrder);
    if (!downShift.success) return downShift;
    const upShift = await shiftSiblingsUp(roadmapId, newParentItemId, newIndex);
    if (!upShift.success) return upShift;

    // 7. Final update: re-parent + retype + swap discriminators + set depth.
    {
        const { error } = await supabase
            .from('roadmap_items')
            .update({
                parent_item_id: newParentItemId,
                sort_order: newIndex,
                depth: newDepth,
                item_type: newType,
                subcategory_type: nextSubcategoryType,
                group_item_type: nextGroupItemType,
                updated_at: new Date().toISOString(),
            })
            .eq('roadmap_id', roadmapId)
            .eq('item_id', itemId);
        if (error) return { success: false, error: `Final update: ${error.message}` };
    }

    // No descendant depth pass — the MVP guarantees no children.
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
    changedByEmail?: string,
    changedByLabel?: string
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
    console.log('[changelog] fullDocumentSync:', { changedByEmail: changedByEmail ?? null, inserts: diff.inserts.length, updates: diff.updates.length, deletes: diff.deletes.length });
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
                        changedByLabel: changedByLabel ?? null,
                    });
                }
            }
        }

        console.log('[changelog] changeRecords to insert:', changeRecords.length, changeRecords.map(r => `${r.field}: ${r.oldValue} → ${r.newValue}`));
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
    changedByLabel: string | null;
    changedAt: string;
}

export interface InsertItemChangeInput {
    itemId: string;
    team: string | null;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedByLabel?: string | null;
}

/**
 * Insert a single change record into roadmap_item_changes.
 */
export async function insertItemChange(
    roadmapId: string,
    change: InsertItemChangeInput
): Promise<void> {
    const { error } = await supabase.from('roadmap_item_changes').insert({
        roadmap_id: roadmapId,
        item_id: change.itemId,
        team: change.team,
        field: change.field,
        old_value: change.oldValue,
        new_value: change.newValue,
        changed_by: change.changedBy,
        changed_by_label: change.changedByLabel ?? null,
    });
    if (error) {
        console.error('[changelog] insertItemChange failed:', error.message, change);
    }
}

/**
 * Insert multiple change records in a single batch.
 */
export async function insertItemChanges(
    roadmapId: string,
    changes: InsertItemChangeInput[]
): Promise<void> {
    if (changes.length === 0) return;
    const { error } = await supabase.from('roadmap_item_changes').insert(
        changes.map(c => ({
            roadmap_id: roadmapId,
            item_id: c.itemId,
            team: c.team,
            field: c.field,
            old_value: c.oldValue,
            new_value: c.newValue,
            changed_by: c.changedBy,
            changed_by_label: c.changedByLabel ?? null,
        }))
    );
    if (error) {
        console.error('[changelog] insertItemChanges failed:', error.message, `(${changes.length} records)`);
    }
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
        changedByLabel: (row.changed_by_label as string) ?? null,
        changedAt: row.changed_at as string,
    };
}

/**
 * Load direct children of type 'team' for a given item.
 * Used to resolve which item IDs to query for parent aggregation.
 */
export async function loadTeamChildrenIds(
    roadmapId: string,
    itemId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from('roadmap_items')
        .select('item_id')
        .eq('roadmap_id', roadmapId)
        .eq('parent_item_id', itemId)
        .eq('item_type', 'team');
    if (error || !data) return [];
    return data.map(row => row.item_id as string);
}

/**
 * Load the latest change per (team, field) for one or more items.
 * Only returns changes for the 3 key fields: status, startDate, endDate.
 * Used for the compact default view in EditPopup.
 */
export async function loadLatestChanges(
    roadmapId: string,
    itemIds: string[]
): Promise<ItemChangeRecord[]> {
    if (itemIds.length === 0) return [];

    const { data, error } = await supabase
        .from('roadmap_item_changes')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .in('item_id', itemIds)
        .in('field', ['status', 'startDate', 'endDate'])
        .order('changed_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('[changelog] loadLatestChanges error:', error.message);
        return [];
    }
    if (!data) return [];

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
 * Load full paginated change history for one or more items.
 * Supports filtering by team.
 */
export async function loadChangeHistory(
    roadmapId: string,
    itemIds: string[],
    options?: { limit?: number; offset?: number; team?: string }
): Promise<{ changes: ItemChangeRecord[]; total: number }> {
    if (itemIds.length === 0) return { changes: [], total: 0 };

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    let query = supabase
        .from('roadmap_item_changes')
        .select('*', { count: 'exact' })
        .eq('roadmap_id', roadmapId)
        .in('item_id', itemIds)
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
