import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdminRequest, type AuthenticatedTeamRequest } from '@/lib/serverTeamAuth';
import { getAllStatusesFromConfig, type ItemStatus } from '@/types/roadmap';
import type {
    AdminItemFieldChange,
    AdminItemFieldName,
    RoadmapAdminItemPatchRequest,
} from '@/types/roadmapSave';
import { normalizeVersion } from '@/utils/roadmapConcurrency';
import { validateBaseVersion } from '@/utils/roadmapSaveFlow';
import { logRoadmapSaveTelemetry } from '@/utils/roadmapSaveTelemetry';
import {
    getStorageMode,
    loadItemWithAncestors,
    loadRoadmapConfig,
    loadRoadmapVersion,
    bumpRoadmapTimestamp,
    updateItemFields,
    regenerateJsonBlob,
    insertItemChange,
    insertItemChanges,
    insertItemSubtree,
    deleteItemSubtree,
    moveItem,
    convertItemType,
    type ItemFieldPatch,
    type InsertItemChangeInput,
} from '@/server/roadmapRowsRepo';
import type { RoadmapItem } from '@/types/roadmap';

export const runtime = 'nodejs';

// Fields an admin may patch row-by-row. Managers have a stricter subset
// (see manager-save/route.ts MANAGER_ALLOWED_FIELDS).
const ADMIN_ALLOWED_FIELDS: ReadonlySet<AdminItemFieldName> = new Set<AdminItemFieldName>([
    'status',
    'startDate',
    'endDate',
    'quickNote',
    'name',
    'priority',
    'version',
    'groupItemType',
    'phaseIds',
    'extra',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUICK_NOTE_LENGTH = 500;
const MAX_NAME_LENGTH = 500;

/**
 * POST /api/roadmap/[id]/admin-patch — Row-level admin patch (table mode).
 *
 * Supports four kinds of operations on a roadmap without shipping the full
 * document:
 *   - kind: 'fields'      → patch scalar fields on one or more items
 *   - kind: 'add-item'    → insert a new item (not implemented in Phase 1)
 *   - kind: 'delete-item' → delete an item + descendants (not implemented in Phase 1)
 *   - kind: 'move-item'   → reparent / reorder an item (not implemented in Phase 1)
 *
 * Concurrency: uses the same `roadmap_data.updated_at` baseVersion token as
 * admin /save and manager /manager-save. Only rejects the request when
 * baseVersion is stale. Row-level patches mean admin conflicts with manager
 * edits are rare (both editing the same field on the same item), so 409s are
 * far less frequent than with full-document save.
 *
 * For legacy JSON-mode roadmaps, admin still uses /save — this endpoint
 * returns 400 if the roadmap is in json mode.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: roadmapId } = await params;
    try {
        const auth = await authenticateAdminRequest(request);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const mode = await getStorageMode(roadmapId);
        if (mode === 'json') {
            return NextResponse.json(
                { error: 'Legacy JSON roadmap does not support admin-patch. Use /save instead.' },
                { status: 400 },
            );
        }

        const body = await request.json().catch(() => null);
        const patch = resolveAdminItemPatchRequest(body);
        if (!patch) {
            return NextResponse.json({ error: 'Invalid admin-patch payload' }, { status: 400 });
        }

        // Version check applies to every kind — we want admin edits to be
        // rejected when the roadmap has moved on since the client loaded it.
        // Source: roadmaps.updated_at (matches /api/roadmap/[id]/version for
        // table mode — using any other column would cause spurious 409s).
        const currentVersion = await loadRoadmapVersion(roadmapId);
        const versionCheck = validateBaseVersion(patch.baseVersion, currentVersion);
        if (!versionCheck.ok) {
            logRoadmapSaveTelemetry({
                route: 'admin-patch',
                roadmapId,
                outcome: 'rejected',
                status: versionCheck.status,
                reason: 'version-mismatch',
                baseVersion: patch.baseVersion,
                serverVersion: currentVersion,
                actor: auth.sessionUser,
            });
            return NextResponse.json(versionCheck.payload, { status: versionCheck.status });
        }

        if (patch.kind === 'fields') {
            return handleFieldsPatch(roadmapId, patch, auth);
        }
        if (patch.kind === 'add-item') {
            return handleAddItemPatch(roadmapId, patch, auth);
        }
        if (patch.kind === 'delete-item') {
            return handleDeleteItemPatch(roadmapId, patch, auth);
        }
        if (patch.kind === 'move-item') {
            return handleMoveItemPatch(roadmapId, patch, auth);
        }
        if (patch.kind === 'convert-item-type') {
            return handleConvertTypePatch(roadmapId, patch, auth);
        }

        return NextResponse.json(
            { error: `Unknown admin-patch kind` },
            { status: 400 },
        );
    } catch (err: unknown) {
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: 'error',
            status: 500,
            reason: 'unexpected-exception',
        });
        console.error('Failed admin-patch:', err);
        return NextResponse.json({ error: 'Failed admin-patch', message: String(err) }, { status: 500 });
    }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleFieldsPatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'fields' }>,
    auth: AuthenticatedTeamRequest,
) {
    if (patch.changes.length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    const config = await loadRoadmapConfig(roadmapId);
    const validStatuses = new Set<string>(getAllStatusesFromConfig(config));

    const violations: string[] = [];
    const changeRecords: InsertItemChangeInput[] = [];
    let appliedCount = 0;

    for (const change of patch.changes) {
        const validation = validateAdminFieldChange(change, validStatuses);
        if (!validation.ok) {
            violations.push(validation.reason);
            continue;
        }

        // Load current row to capture old value for changelog
        const chain = await loadItemWithAncestors(roadmapId, change.itemId);
        if (chain.length === 0) {
            violations.push(`Item "${change.itemId}" not found`);
            continue;
        }
        const item = chain[0];

        // Admin can edit any item including categories — no team ownership check.
        const rowPatch = buildItemFieldPatch(change);
        const oldValue = captureOldValue(item as unknown as Record<string, unknown>, change.field);

        const result = await updateItemFields(roadmapId, change.itemId, rowPatch);
        if (!result.success) {
            violations.push(`Failed to update item "${change.itemId}": ${result.error}`);
            continue;
        }

        appliedCount++;
        const newValue = serializeChangeValue(change.value);
        if (oldValue !== newValue) {
            changeRecords.push({
                itemId: change.itemId,
                team: resolveItemTeam(chain),
                field: change.field,
                oldValue,
                newValue,
                changedBy: auth.sessionUser.email,
                changedByLabel: auth.sessionUser.label,
            });
        }
    }

    if (appliedCount === 0 && violations.length > 0) {
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: 'rejected',
            status: 400,
            reason: 'all-changes-invalid',
            changeCount: patch.changes.length,
            actor: auth.sessionUser,
        });
        return NextResponse.json({ error: 'All changes rejected', violations }, { status: 400 });
    }

    if (changeRecords.length > 0) {
        await insertItemChanges(roadmapId, changeRecords);
    }

    // Refresh JSON blob backup, then bump roadmaps.updated_at so the client's
    // next baseVersion matches what /version will return.
    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: patch.changes.length,
        actor: auth.sessionUser,
    });

    return NextResponse.json({
        success: true,
        updatedAt: persistedVersion,
        appliedCount,
        ...(violations.length > 0 ? { warnings: violations } : {}),
    });
}

async function handleAddItemPatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'add-item' }>,
    auth: AuthenticatedTeamRequest,
) {
    const validation = validateIncomingItem(patch.item);
    if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const result = await insertItemSubtree(
        roadmapId,
        patch.parentItemId,
        Math.max(0, Math.floor(patch.insertIndex)),
        patch.item,
    );
    if (!result.success) {
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: 'error',
            status: 500,
            reason: `add-item: ${result.error ?? 'unknown'}`,
            actor: auth.sessionUser,
        });
        return NextResponse.json({ error: 'Failed to insert item', message: result.error }, { status: 500 });
    }

    // Changelog: one record marking the subtree creation.
    await insertItemChange(roadmapId, {
        itemId: patch.item.id,
        team: patch.item.teamRole ?? null,
        field: '__created__',
        oldValue: null,
        newValue: patch.item.name,
        changedBy: auth.sessionUser.email,
        changedByLabel: auth.sessionUser.label,
    });

    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: 1,
        actor: auth.sessionUser,
    });

    return NextResponse.json({ success: true, updatedAt: persistedVersion, insertedItemId: patch.item.id });
}

async function handleDeleteItemPatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'delete-item' }>,
    auth: AuthenticatedTeamRequest,
) {
    // Load for changelog before deletion
    const chain = await loadItemWithAncestors(roadmapId, patch.itemId);
    if (chain.length === 0) {
        return NextResponse.json({ error: `Item "${patch.itemId}" not found` }, { status: 404 });
    }
    const item = chain[0];

    const result = await deleteItemSubtree(roadmapId, patch.itemId);
    if (!result.success) {
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: 'error',
            status: 500,
            reason: `delete-item: ${result.error ?? 'unknown'}`,
            actor: auth.sessionUser,
        });
        return NextResponse.json({ error: 'Failed to delete item', message: result.error }, { status: 500 });
    }

    await insertItemChange(roadmapId, {
        itemId: patch.itemId,
        team: resolveItemTeam(chain),
        field: '__deleted__',
        oldValue: item.name,
        newValue: null,
        changedBy: auth.sessionUser.email,
        changedByLabel: auth.sessionUser.label,
    });

    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: 1,
        actor: auth.sessionUser,
    });

    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}

async function handleMoveItemPatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'move-item' }>,
    auth: AuthenticatedTeamRequest,
) {
    const chain = await loadItemWithAncestors(roadmapId, patch.itemId);
    if (chain.length === 0) {
        return NextResponse.json({ error: `Item "${patch.itemId}" not found` }, { status: 404 });
    }

    const result = await moveItem(
        roadmapId,
        patch.itemId,
        patch.newParentItemId,
        Math.max(0, Math.floor(patch.newIndex)),
    );
    if (!result.success) {
        // Distinguish "bad move" (self-cycle) from internal failure
        const isBadMove = result.error?.startsWith('Cannot move');
        const status = isBadMove ? 400 : 500;
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: isBadMove ? 'rejected' : 'error',
            status,
            reason: `move-item: ${result.error ?? 'unknown'}`,
            actor: auth.sessionUser,
        });
        return NextResponse.json({ error: 'Failed to move item', message: result.error }, { status });
    }

    await insertItemChange(roadmapId, {
        itemId: patch.itemId,
        team: resolveItemTeam(chain),
        field: '__moved__',
        oldValue: chain[0].parentItemId ?? null,
        newValue: patch.newParentItemId,
        changedBy: auth.sessionUser.email,
        changedByLabel: auth.sessionUser.label,
    });

    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: 1,
        actor: auth.sessionUser,
    });

    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}

async function handleConvertTypePatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'convert-item-type' }>,
    auth: AuthenticatedTeamRequest,
) {
    // Early shape check — the type gate in resolveAdminItemPatchRequest already
    // enforces this, but keeping the runtime guard protects against hand-crafted
    // payloads that bypass the resolver (e.g. future code paths).
    if (patch.newType !== 'subcategory' && patch.newType !== 'group') {
        return NextResponse.json({ error: `Invalid newType "${patch.newType}"` }, { status: 400 });
    }

    // Capture the item's current ancestor chain BEFORE the convert so the
    // changelog `__converted__` record can attribute the old team/role state.
    const chain = await loadItemWithAncestors(roadmapId, patch.itemId);
    if (chain.length === 0) {
        return NextResponse.json({ error: `Item "${patch.itemId}" not found` }, { status: 404 });
    }
    const oldType = chain[0].itemType;

    const result = await convertItemType(
        roadmapId,
        patch.itemId,
        patch.newType,
        patch.newParentItemId,
        Math.max(0, Math.floor(patch.newIndex)),
    );
    if (!result.success) {
        const status = result.userError ? 400 : 500;
        logRoadmapSaveTelemetry({
            route: 'admin-patch',
            roadmapId,
            outcome: result.userError ? 'rejected' : 'error',
            status,
            reason: `convert-item-type: ${result.error ?? 'unknown'}`,
            actor: auth.sessionUser,
        });
        return NextResponse.json({ error: 'Failed to convert item', message: result.error }, { status });
    }

    await insertItemChange(roadmapId, {
        itemId: patch.itemId,
        team: resolveItemTeam(chain),
        field: '__converted__',
        oldValue: oldType ?? null,
        newValue: patch.newType,
        changedBy: auth.sessionUser.email,
        changedByLabel: auth.sessionUser.label,
    });

    if (result.wrapperId) {
        await insertItemChange(roadmapId, {
            itemId: result.wrapperId,
            team: resolveItemTeam(chain),
            field: '__wrapped__',
            oldValue: null,
            newValue: patch.itemId, // ties wrapper to the converted source
            changedBy: auth.sessionUser.email,
            changedByLabel: auth.sessionUser.label,
        });
    }

    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: 1,
        actor: auth.sessionUser,
        reason: result.wrapperId ? 'convert-with-wrap' : undefined,
    });

    return NextResponse.json({ success: true, updatedAt: persistedVersion });
}

/**
 * Bumps roadmaps.updated_at (source of truth for baseVersion + /version
 * endpoint) and returns the fresh timestamp. All successful admin-patch
 * handlers call this so the client's next baseVersion matches what /version
 * polls will return.
 */
async function bumpAndRead(roadmapId: string): Promise<string> {
    const now = await bumpRoadmapTimestamp(roadmapId);
    return normalizeVersion(now) ?? now;
}

function validateIncomingItem(item: unknown): { ok: true } | { ok: false; reason: string } {
    if (!item || typeof item !== 'object') return { ok: false, reason: 'item must be an object' };
    const it = item as Partial<RoadmapItem>;
    if (typeof it.id !== 'string' || !it.id.trim()) return { ok: false, reason: 'item.id is required' };
    if (typeof it.name !== 'string' || !it.name.trim()) return { ok: false, reason: 'item.name is required' };
    if (typeof it.type !== 'string') return { ok: false, reason: 'item.type is required' };
    return { ok: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveAdminItemPatchRequest(body: unknown): RoadmapAdminItemPatchRequest | null {
    if (!body || typeof body !== 'object') return null;
    const payload = body as Partial<RoadmapAdminItemPatchRequest> & Record<string, unknown>;
    const baseVersion = normalizeVersion(payload.baseVersion as string | null | undefined);

    if (payload.kind === 'fields' && Array.isArray(payload.changes)) {
        // Normalize shape — force each entry to have itemId + field + value.
        const changes: AdminItemFieldChange[] = [];
        for (const raw of payload.changes) {
            if (!raw || typeof raw !== 'object') continue;
            const c = raw as Partial<AdminItemFieldChange>;
            if (typeof c.itemId !== 'string' || typeof c.field !== 'string') continue;
            changes.push({
                itemId: c.itemId,
                field: c.field as AdminItemFieldName,
                value: (c as { value?: unknown }).value ?? null,
            });
        }
        return { kind: 'fields', changes, baseVersion };
    }

    if (payload.kind === 'add-item' && typeof payload.item === 'object' && payload.item) {
        return {
            kind: 'add-item',
            parentItemId: (payload.parentItemId as string | null | undefined) ?? null,
            insertIndex: Number(payload.insertIndex ?? 0),
            item: payload.item as Extract<RoadmapAdminItemPatchRequest, { kind: 'add-item' }>['item'],
            baseVersion,
        };
    }

    if (payload.kind === 'delete-item' && typeof payload.itemId === 'string') {
        return { kind: 'delete-item', itemId: payload.itemId, baseVersion };
    }

    if (payload.kind === 'move-item' && typeof payload.itemId === 'string') {
        return {
            kind: 'move-item',
            itemId: payload.itemId,
            newParentItemId: (payload.newParentItemId as string | null | undefined) ?? null,
            newIndex: Number(payload.newIndex ?? 0),
            baseVersion,
        };
    }

    if (
        payload.kind === 'convert-item-type'
        && typeof payload.itemId === 'string'
        && (payload.newType === 'subcategory' || payload.newType === 'group')
    ) {
        return {
            kind: 'convert-item-type',
            itemId: payload.itemId,
            newType: payload.newType,
            newParentItemId: (payload.newParentItemId as string | null | undefined) ?? null,
            newIndex: Number(payload.newIndex ?? 0),
            baseVersion,
        };
    }

    return null;
}

function validateAdminFieldChange(
    change: AdminItemFieldChange,
    validStatuses: Set<string>,
): { ok: true } | { ok: false; reason: string } {
    if (!ADMIN_ALLOWED_FIELDS.has(change.field)) {
        return { ok: false, reason: `Field "${change.field}" is not editable via admin-patch` };
    }

    const { field, value } = change;

    if (field === 'status') {
        const s = String(value ?? '');
        if (!validStatuses.has(s)) {
            return { ok: false, reason: `Status "${s}" is not valid for this roadmap` };
        }
    }

    if (field === 'startDate' || field === 'endDate') {
        if (value !== null && value !== undefined && value !== '') {
            if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
                return { ok: false, reason: `${field} must be an ISO date (YYYY-MM-DD) or null` };
            }
        }
    }

    if (field === 'quickNote') {
        if (value !== null && value !== undefined && typeof value !== 'string') {
            return { ok: false, reason: 'quickNote must be string or null' };
        }
        if (typeof value === 'string' && value.length > MAX_QUICK_NOTE_LENGTH) {
            return { ok: false, reason: `quickNote exceeds ${MAX_QUICK_NOTE_LENGTH} characters` };
        }
    }

    if (field === 'name') {
        if (typeof value !== 'string' || value.trim().length === 0) {
            return { ok: false, reason: 'name must be a non-empty string' };
        }
        if (value.length > MAX_NAME_LENGTH) {
            return { ok: false, reason: `name exceeds ${MAX_NAME_LENGTH} characters` };
        }
    }

    if (field === 'phaseIds') {
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
            return { ok: false, reason: 'phaseIds must be an array of strings' };
        }
    }

    if (field === 'extra') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false, reason: 'extra must be an object of string key/value pairs' };
        }
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (typeof k !== 'string' || typeof v !== 'string') {
                return { ok: false, reason: 'extra entries must be string → string' };
            }
        }
    }

    // priority / version / groupItemType are free-form strings (or null) — no
    // enum validation here, since roadmap config determines valid values and
    // the grid already shows only valid options.
    return { ok: true };
}

function buildItemFieldPatch(change: AdminItemFieldChange): ItemFieldPatch {
    const patch: ItemFieldPatch = {};
    switch (change.field) {
        case 'status': {
            const v = change.value as ItemStatus;
            patch.status = v;
            patch.statusMode = 'manual';
            patch.manualStatus = v;
            break;
        }
        case 'startDate':
            patch.startDate = (change.value as string) || null;
            break;
        case 'endDate':
            patch.endDate = (change.value as string) || null;
            break;
        case 'quickNote':
            patch.quickNote = (change.value as string) || null;
            break;
        case 'name':
            patch.name = change.value as string;
            break;
        case 'priority':
            patch.priority = change.value == null ? null : String(change.value);
            break;
        case 'version':
            patch.version = change.value == null ? null : String(change.value);
            break;
        case 'groupItemType':
            patch.groupItemType = change.value == null ? null : String(change.value);
            break;
        case 'phaseIds':
            patch.phaseIds = Array.isArray(change.value) ? change.value as string[] : [];
            break;
        case 'extra':
            patch.extra = (change.value as Record<string, string>) ?? {};
            break;
    }
    return patch;
}

function captureOldValue(item: Record<string, unknown>, field: AdminItemFieldName): string | null {
    // Map admin field name → row column key
    const src: Record<AdminItemFieldName, unknown> = {
        status: item.status,
        startDate: item.startDate,
        endDate: item.endDate,
        quickNote: item.quickNote,
        name: item.name,
        priority: item.priority,
        version: item.version,
        groupItemType: item.groupItemType,
        phaseIds: item.phaseIds,
        extra: item.extra,
    };
    return serializeChangeValue(src[field]);
}

function serializeChangeValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(',');
    if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return null; }
    }
    return String(value);
}

function resolveItemTeam(chain: Array<{ teamRole?: string }>): string | null {
    for (const item of chain) {
        if (item.teamRole) return item.teamRole;
    }
    return null;
}
