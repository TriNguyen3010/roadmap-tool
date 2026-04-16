# Design: Convert Group With Children → Subcategory (Auto-Wrap)

**Date:** 2026-04-16
**Owner:** Admin structural-edit feature
**Status:** Approved (pending implementation)

## 1. Context

The current drag-convert feature (shipped 2026-04-16, see
`plan/2026-04-16-drag-convert-group-subcategory.md`) only allows converting
**empty** groups ⇄ subcategories. The UX rejects any drop where the source
item still has children, forcing users to manually move every child elsewhere
before they can promote.

In practice users work with groups that always have team children
(BA/BE/QC/…) because `AddNodePopup` auto-creates a `type='team'` row for each
configured team role. This means the empty-only constraint makes the feature
effectively unusable for its primary use case: promoting a "big feature" group
up to subcategory level once its scope has grown.

This design removes the empty-only constraint **in one direction only**:
`group → subcategory`. The reverse direction (`subcategory → group`) keeps
the empty-only constraint because a subcategory's children are groups, and
demoting would require nesting groups inside a group — which the schema
forbids.

## 2. Goals & Non-Goals

### Goals

- Drag a non-empty group onto a category row → the group becomes a subcategory
  under that category, and its original team/item children stay intact under a
  newly-created wrapper group.
- Wrapper group's name = source group's original name (no user input required).
- Wrapper group inherits `groupItemType` from the source group.
- Single short confirmation dialog; no structural preview.
- All-or-nothing: if the server-side transaction fails at any step, no partial
  state is persisted.

### Non-Goals

- Extending auto-wrap to `subcategory → group` (subcategory children are
  groups, cascade would break schema).
- Letting the user pick the wrapper name, rename inline, or choose a different
  existing wrapper.
- Batch convert (multi-select).
- Undo UI beyond the usual page reload.
- JSON-mode support.

## 3. User Flow

### Happy path

1. Admin grabs the group row `[SwapX] Implement revenue settlement flow`
   (which has team children `BA`, `BE`, `QC`).
2. Drags onto the category row `App - Features`.
3. Row `App - Features` highlights **purple** (same as current empty-group
   feedback) — no separate visual for non-empty.
4. Admin releases.
5. Confirmation dialog:
   *"Bạn có chắc muốn chuyển "[SwapX] Implement revenue settlement flow"
   từ Group thành Subcategory bên dưới "App - Features"?"*
6. Admin confirms.
7. Optimistic UI update renders the new structure; server persists; toast
   shows success.

### Resulting structure

```
Before                                        After
─────────────────────────────────────────────────────────────────────────
App (category)                                App (category)
├─ SwapX (subcategory)                        ├─ SwapX (subcategory)
│  ├─ [Li.Fi]… (group)                        │  └─ [Li.Fi]… (group)
│  └─ [SwapX] Implement… (group)     ────►    └─ [SwapX] Implement… (subcategory) ◄ promoted
│     ├─ BA (team)                               └─ [SwapX] Implement… (group, auto-wrap)
│     ├─ BE                                         ├─ BA (team)
│     └─ QC                                         ├─ BE
                                                    └─ QC
```

Placement rule: the new subcategory is appended at the end of the target
category's children (matches current behaviour for the empty case).

### Edge cases

| Case | Behaviour |
|------|-----------|
| Source group is empty | Behaves exactly like current flow: no wrapper group is created; direct conversion. |
| Dialog cancelled | No API call; optimistic state never applied; drag state reset. |
| Server version conflict (409) | Rollback optimistic update, reload roadmap, toast "Data đã thay đổi…". |
| Wrapper insert fails mid-transaction | All steps rolled back; error toast; no partial rows left behind. |
| User drags subcategory with children onto another subcategory | Still blocked with red tooltip (unchanged). |
| User drags group with children onto a subcategory (parent mode, not convert) | Still works as `move-item` parent drop (unchanged). |

## 4. Architecture

### 4.1. Type layer (`src/types/roadmapSave.ts`)

No change. The existing `convert-item-type` variant is sufficient — the
wrapper-group step is an internal server concern, not a separate patch kind.

### 4.2. Client helpers (`src/utils/roadmapHelpers.ts`)

Add one helper:

```ts
// Returns an optimistic tree that promotes `group` to subcategory and wraps
// its original children inside a new group (same name, same groupItemType).
// Caller is responsible for using the returned wrapper.id to reconcile with
// the server's real wrapper id once the response arrives.
export function convertGroupToSubcategoryWithWrap(
    item: RoadmapItem,
    generateId: () => string,
): { subcategory: RoadmapItem; wrapperId: string };
```

Implementation notes:
- If `item.children` is empty, fall back to the existing
  `convertGroupToSubcategory` (no wrapper).
- The wrapper's `id` is generated client-side for optimistic rendering. When
  the server response arrives the whole document is reloaded
  (`runAdminStructurePatch` already calls `loadRoadmap()`), so any id drift is
  self-correcting on the next refresh.
- Wrapper's `groupItemType` copied from source; `subcategoryType` of the new
  subcategory is mapped from source's `groupItemType` via the existing
  `GROUP_TO_SUBCAT_TYPE` table (`Improvement → Feature`, others identity).

### 4.3. DnD validator (`src/components/SpreadsheetGrid.tsx`)

Change inside `isValidConvertDrop`:

```diff
  if (source.type === 'group' && target.type === 'category') {
-     if (!hasNoChildren(source)) {
-         const n = source.children?.length ?? 0;
-         return { ok: false, reason: `Không thể promote: group còn ${n}…` };
-     }
      return { ok: true, newType: 'subcategory' };
  }

  if (source.type === 'subcategory' && target.type === 'subcategory') {
      if (!hasNoChildren(source)) { /* unchanged — still blocked */ }
      return { ok: true, newType: 'group' };
  }
```

No change to visual feedback (purple ring stays). `dragConvertBlockedReason`
still lights up for `subcategory → subcategory` with children.

### 4.4. Drop handler (`src/components/SpreadsheetGrid.tsx`)

Inside `handleDrop`'s `result.mode === 'convert'` branch, replace the current
`convertGroupToSubcategory` / `convertSubcategoryToGroup` single-item
conversion with:

```ts
if (result.newType === 'subcategory' && source.children && source.children.length > 0) {
    const { subcategory } = convertGroupToSubcategoryWithWrap(source, () => crypto.randomUUID());
    // Insert subcategory under target category (replacing old group)
    const afterRemove = deleteNodeById(data.items, capturedDraggedId);
    const afterInsert = addChildToNode(afterRemove, targetId, touchItemTimestamp(subcategory));
    // … rest of flow unchanged …
}
```

The `onAdminConvertType` callback signature stays the same: server side owns
wrapper creation; client only provides the original patch payload.

### 4.5. Server repo (`src/server/roadmapRowsRepo.ts`)

Extend `convertItemType` to handle the wrapper case. Conceptual sequence for
`newType === 'subcategory'` when source has children:

1. Load source row (existing step) — fetch `item_type`, `group_item_type`, name.
2. Count children (existing step) — **do NOT reject** when `newType ==='subcategory'`. Reject only for the reverse direction or unexpected types.
3. Validate new parent hierarchy (existing step).
4. Allocate `wrapperId = randomUUID()` if `childCount > 0 && newType === 'subcategory'`.
5. Park source at `sort_order = -1` (existing step).
6. Shift siblings down on old parent (existing).
7. Shift siblings up on new parent (existing).
8. Final update of source row: new parent, new type (`subcategory`), new
   discriminators (swap group_item_type → subcategory_type), depth from new
   parent (existing).
9. **NEW**: if `wrapperId` is set:
   a. Insert wrapper row: same name, `item_type='group'`,
      `group_item_type = <source's original>`, `parent_item_id = sourceId`,
      `sort_order = 0`, `depth = newSubcategoryDepth + 1`.
   b. `UPDATE roadmap_items SET parent_item_id = wrapperId
      WHERE parent_item_id = sourceId AND item_id != wrapperId`.
      **Depth is NOT changed** — see 4.5.1 for why.

#### 4.5.1. Why no depth bump is needed

Before convert:   `category(0) > subcategory(1) > source group(2) > team(3)`
After convert:    `category(0) > subcategory source(1) > wrapper group(2) > team(3)`

The source moves up one level (`2 → 1`, handled in step 8), but the wrapper
slots into the source's old depth (`2`). Every descendant's `parent.depth`
is therefore unchanged, so their own `depth` stays correct. This holds at
every descendant level (items under teams, etc.) because none of them moved
vertically — only the source did.

Consequence: **no recursive subtree walk is required**. A single
`UPDATE ... WHERE parent_item_id = sourceId` suffices.

#### 4.5.2. Atomicity

All eight/nine steps must succeed or rollback together. The current
`convertItemType` uses sequential Supabase updates without an explicit
transaction — this design adds a wrapper RPC in Postgres so the whole
operation runs inside a single `BEGIN/COMMIT`:

- New RPC `admin_convert_group_with_wrap(p_roadmap_id, p_item_id,
  p_new_parent_id, p_new_index, p_wrapper_id)` returns `(success, error,
  wrapper_id)`.
- `convertItemType` calls this RPC when `newType==='subcategory' && childCount > 0`;
  otherwise keeps the existing sequential path (for empty groups and
  subcategory→group demotion).

Migration: SQL migration file adds the RPC; deploy before code.

### 4.6. API route (`src/app/api/roadmap/[id]/admin-patch/route.ts`)

- Dispatch unchanged (`handleConvertTypePatch`).
- After `convertItemType` succeeds, write **two** changelog rows when a
  wrapper was created:
  - Existing `__converted__` row (oldType → newType) for the source.
  - New `__wrapped__` row on the wrapper id recording `oldValue=null`,
    `newValue=<source name>`, team = resolved team from ancestors.
- Telemetry payload adds `wrapperCreated: boolean` for ops debugging.

### 4.7. Changelog / audit

`__wrapped__` is a new synthetic field name. It is filtered the same way as
`__converted__` in any UI that renders the changelog (no new branch needed —
both are treated as structural events).

## 5. Data Flow

```
Admin drops group X onto category Y
  │
  ▼
SpreadsheetGrid.handleDrop
  │   (source.children?.length > 0, newType='subcategory')
  ├─ convertGroupToSubcategoryWithWrap(X, uuid)  ── optimistic tree
  ├─ onAdminConvertType(X.id, 'subcategory', Y.id, newIndex, optimisticData)
  │
  ▼
page.tsx runAdminStructurePatch
  │   POST /admin-patch { kind: 'convert-item-type', … }
  │
  ▼
route.ts handleConvertTypePatch
  │   convertItemType(…)
  │
  ▼
roadmapRowsRepo.convertItemType
  │   if (newType==='subcategory' && childCount>0)
  │     → RPC admin_convert_group_with_wrap  (atomic)
  │   else
  │     → existing sequential path
  │
  ▼
regenerateJsonBlob → bumpVersion → return updatedAt
  │
  ▼
Client loadRoadmap() reconciles; optimistic wrapper id replaced by server id.
```

## 6. Testing

### 6.1. Unit (`roadmapHelpers.test.ts`)

- `convertGroupToSubcategoryWithWrap`: non-empty group → subcategory wraps
  children; empty group → direct convert (no wrapper).
- Name preservation: wrapper.name === source.name.
- `groupItemType` preserved on wrapper.
- Children order preserved in wrapper.

### 6.2. Repo (`roadmapRowsRepo.test.ts`)

- Convert group with 3 team children → DB has: source row type=subcategory at
  `new subcategory depth`, new wrapper row type=group parented under source at
  `source.depth + 1` (which equals the source's OLD depth), 3 teams parented
  under wrapper with their `depth` **unchanged** from before the convert
  (see 4.5.1).
- Convert empty group → no wrapper row created, old behaviour.
- Convert fails midway (simulated constraint violation) → no partial rows.

### 6.3. API integration

- POST convert-item-type on group with children → 200, document has wrapper.
- Changelog has both `__converted__` and `__wrapped__` rows.
- Manager role → 403 (unchanged).

### 6.4. E2E manual

- [ ] Drag group with BA/BE/QC onto category → dialog → confirm → wrapper
  appears with teams inside.
- [ ] Drag empty group onto category → no wrapper created.
- [ ] Drag subcategory with children onto subcategory → still blocked (red).
- [ ] Reload page after convert → structure persists.
- [ ] Concurrent conflict → 409, reload, convert visible.

## 7. Rollout

1. Ship DB migration (RPC only) — backward compatible, no behavior change.
2. Ship server code that uses the RPC — still behind empty-only validation on
   client, so no UX change yet.
3. Ship client code that removes the empty-only validator — feature live.

Rollback: revert step 3 first (fastest; just re-add the `hasNoChildren`
check). The RPC and wrapper logic on the server can stay; they simply won't
be triggered.

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Depth drift on deep subtrees | Low | Recursive subtree walk in RPC covers all descendants, not just direct children. |
| Wrapper id collision with existing ids | Very low | UUID v4 collision space; also scoped by `(roadmap_id, item_id)` unique constraint will reject collisions. |
| Optimistic wrapper id ≠ server id confuses clients | Low | `runAdminStructurePatch` already reloads full document, which replaces client ids. |
| User expects to rename wrapper inline | Medium | Document in release note: "Group wrapper auto-named; rename via edit popup if desired." |
| RPC deployed but old server code hits non-existent RPC | Medium | Ship migration first; server code gracefully falls back to sequential path if RPC missing (feature-detect). |
| Duplicate names (source + wrapper have same name) confuse users | Low-Medium | Acceptable for MVP; wrapper is visually nested so hierarchy is clear. |

## 9. Open Questions

None remaining — Q1 and Q2 resolved during brainstorming
(wrapper-name = source-name; dialog stays short without preview).

## 10. Acceptance Criteria

- [ ] Dragging a non-empty group onto a category row shows purple highlight
  (same as empty case).
- [ ] Dialog shows the short text; no preview tree.
- [ ] On confirm, server atomically: promotes source to subcategory, creates
  a wrapper group with same name, reparents children.
- [ ] Changelog has both `__converted__` and `__wrapped__` entries.
- [ ] Empty-group convert path is unchanged.
- [ ] Subcategory-with-children → group is still rejected (no scope creep).
- [ ] Page reload shows persisted structure.
- [ ] Full typecheck + ESLint pass.
