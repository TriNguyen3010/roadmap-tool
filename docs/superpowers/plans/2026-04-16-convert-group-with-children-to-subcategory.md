# Convert Group With Children → Subcategory (Auto-Wrap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "source must be empty" constraint in the existing drag-convert feature for the `group → subcategory` direction, by auto-creating a wrapper group to hold the source's original children.

**Architecture:** Client validator stops rejecting non-empty groups when target is a category. Repo detects the non-empty case and delegates to a new Postgres RPC that atomically (a) promotes the source to subcategory, (b) inserts a wrapper group with the same name, (c) reparents every direct child under the wrapper. Descendant `depth` values are untouched because the wrapper occupies the source group's old depth slot (see spec 4.5.1).

**Tech Stack:** Next.js 16 + React 19, Supabase Postgres (plpgsql for the RPC), Vitest for unit tests, ESLint + TypeScript strict.

**Reference spec:** `docs/superpowers/specs/2026-04-16-convert-group-with-children-to-subcategory-design.md`

---

## File Structure

| File | Role | Change type |
|------|------|-------------|
| `src/utils/roadmapHelpers.ts` | Pure client tree helpers — add `convertGroupToSubcategoryWithWrap` | Modify |
| `src/utils/roadmapHelpers.test.ts` | Unit tests for tree helpers | Modify |
| `supabase/migrations/20260416120000_admin_convert_group_with_wrap_rpc.sql` | RPC that does the atomic convert+wrap+reparent | Create |
| `src/server/roadmapRowsRepo.ts` | `convertItemType` — relax empty-check for `newType='subcategory'`, delegate non-empty case to RPC | Modify |
| `src/app/api/roadmap/[id]/admin-patch/route.ts` | `handleConvertTypePatch` — write extra `__wrapped__` changelog row when wrapper was created | Modify |
| `src/components/SpreadsheetGrid.tsx` | `isValidConvertDrop` — remove `hasNoChildren` check for group→category; `handleDrop` — use new wrap helper when source has children | Modify |

Rollout order matches the task order: migration first (backward compatible), then server, then client. A revert path at any step restores the previous behaviour.

---

## Task 1: Client helper — `convertGroupToSubcategoryWithWrap`

**Files:**
- Modify: `src/utils/roadmapHelpers.ts`
- Modify: `src/utils/roadmapHelpers.test.ts`

### - [ ] Step 1: Write the failing tests

Append this block at the end of `src/utils/roadmapHelpers.test.ts` (after the existing `describe` blocks):

```ts
import { convertGroupToSubcategoryWithWrap } from './roadmapHelpers';

describe('convertGroupToSubcategoryWithWrap', () => {
    const fixedId = 'wrapper-uuid-1';
    const gen = () => fixedId;

    it('wraps existing children under a new group with the same name', () => {
        const source: RoadmapItem = makeItem({
            id: 'g-1',
            name: '[SwapX] Implement revenue settlement flow',
            type: 'group',
            groupItemType: 'Feature',
            children: [
                makeItem({ id: 't-ba', type: 'team', teamRole: 'BA', name: 'BA' }),
                makeItem({ id: 't-be', type: 'team', teamRole: 'BE', name: 'BE' }),
                makeItem({ id: 't-qc', type: 'team', teamRole: 'QC', name: 'QC' }),
            ],
        });

        const { subcategory, wrapperId } = convertGroupToSubcategoryWithWrap(source, gen);

        expect(wrapperId).toBe(fixedId);
        expect(subcategory.type).toBe('subcategory');
        expect(subcategory.subcategoryType).toBe('Feature');
        expect(subcategory.name).toBe(source.name);
        expect('groupItemType' in subcategory).toBe(false);

        expect(subcategory.children).toHaveLength(1);
        const wrapper = subcategory.children![0];
        expect(wrapper.id).toBe(fixedId);
        expect(wrapper.type).toBe('group');
        expect(wrapper.groupItemType).toBe('Feature');
        expect(wrapper.name).toBe(source.name);
        expect(wrapper.children!.map(c => c.id)).toEqual(['t-ba', 't-be', 't-qc']);
    });

    it('maps Improvement → Feature on the new subcategory (spec 4.2)', () => {
        const source: RoadmapItem = makeItem({
            id: 'g-imp',
            type: 'group',
            groupItemType: 'Improvement',
            children: [makeItem({ id: 'i-1', type: 'item' })],
        });

        const { subcategory } = convertGroupToSubcategoryWithWrap(source, gen);
        expect(subcategory.subcategoryType).toBe('Feature');
        // Wrapper still carries the original Improvement type
        expect(subcategory.children![0].groupItemType).toBe('Improvement');
    });

    it('returns wrapperId = null when source has no children (no wrapper needed)', () => {
        const source: RoadmapItem = makeItem({
            id: 'g-empty',
            type: 'group',
            groupItemType: 'Bug',
            children: [],
        });

        const { subcategory, wrapperId } = convertGroupToSubcategoryWithWrap(source, gen);
        expect(wrapperId).toBeNull();
        expect(subcategory.type).toBe('subcategory');
        expect(subcategory.subcategoryType).toBe('Bug');
        expect(subcategory.children).toEqual([]);
    });
});
```

### - [ ] Step 2: Run the tests to verify they fail

```bash
npx vitest run src/utils/roadmapHelpers.test.ts -t convertGroupToSubcategoryWithWrap
```

Expected: FAIL — `convertGroupToSubcategoryWithWrap is not exported` (or similar module error).

### - [ ] Step 3: Add the helper implementation

Open `src/utils/roadmapHelpers.ts`. Find the existing exported `convertGroupToSubcategory` function (it lives near `convertSubcategoryToGroup`). Immediately after `convertGroupToSubcategory`, add:

```ts
/**
 * Convert a group → subcategory while preserving its children inside a
 * newly-created wrapper group. See spec
 * `docs/superpowers/specs/2026-04-16-convert-group-with-children-to-subcategory-design.md`
 * section 4.2.
 *
 * - If `item.children` is empty, returns the same shape as `convertGroupToSubcategory`
 *   but wrapped in the `{ subcategory, wrapperId: null }` envelope for a
 *   uniform caller API.
 * - Wrapper's `id` comes from `generateId()` — caller supplies a UUID source
 *   (e.g. `crypto.randomUUID`). The server response later replaces this id
 *   via `loadRoadmap()` reconciliation.
 */
export function convertGroupToSubcategoryWithWrap(
    item: RoadmapItem,
    generateId: () => string,
): { subcategory: RoadmapItem; wrapperId: string | null } {
    const children = item.children ?? [];
    if (children.length === 0) {
        return { subcategory: convertGroupToSubcategory(item), wrapperId: null };
    }

    const mappedSubcategoryType = item.groupItemType
        ? GROUP_TO_SUBCAT_TYPE[item.groupItemType] ?? 'Feature'
        : 'Feature';

    const wrapperId = generateId();
    const wrapper: RoadmapItem = {
        ...item,
        id: wrapperId,
        type: 'group',
        // groupItemType stays identical to source so wrapper status rollup
        // still matches.
        children,
    } as RoadmapItem;

    // Drop discriminator/children off the `rest` so the new subcategory is
    // clean.
    const rest = { ...item } as Record<string, unknown>;
    delete rest.groupItemType;
    delete rest.children;

    const subcategory = {
        ...rest,
        type: 'subcategory',
        subcategoryType: mappedSubcategoryType,
        children: [wrapper],
    } as unknown as RoadmapItem;

    return { subcategory, wrapperId };
}
```

### - [ ] Step 4: Run the tests to verify they pass

```bash
npx vitest run src/utils/roadmapHelpers.test.ts -t convertGroupToSubcategoryWithWrap
```

Expected: PASS (3 tests).

Also re-run the full helpers test suite to make sure nothing regressed:

```bash
npx vitest run src/utils/roadmapHelpers.test.ts
```

Expected: PASS (all tests, including the new 3).

### - [ ] Step 5: Typecheck

```bash
npx tsc --noEmit
```

Expected: exit code 0.

### - [ ] Step 6: Commit

```bash
git add src/utils/roadmapHelpers.ts src/utils/roadmapHelpers.test.ts
git commit -m "feat(helpers): add convertGroupToSubcategoryWithWrap

Pure helper that promotes a group → subcategory and wraps existing
children inside a new group carrying the source's original name and
groupItemType. Returns wrapperId:null when the source is empty so the
caller can skip wrapper-specific UI.

Refs: docs/superpowers/specs/2026-04-16-convert-group-with-children-to-subcategory-design.md §4.2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Postgres RPC for atomic convert+wrap+reparent

**Files:**
- Create: `supabase/migrations/20260416120000_admin_convert_group_with_wrap_rpc.sql`

### - [ ] Step 1: Create the migration file

Write the following SQL to `supabase/migrations/20260416120000_admin_convert_group_with_wrap_rpc.sql`:

```sql
-- RPC for converting a group with children to a subcategory in a single
-- transaction. The source group becomes a subcategory at a new location, a
-- fresh wrapper group (same name, inherited group_item_type) is inserted as
-- the sole direct child, and all the source's original children are
-- re-parented under the wrapper.
--
-- Descendant depths are NOT modified: the wrapper occupies the source's old
-- depth slot, so every parent.depth → child.depth relationship is preserved.
-- See spec §4.5.1.
--
-- Inputs
--   p_roadmap_id       — roadmap scope
--   p_item_id          — source group id (will become the subcategory id)
--   p_new_parent_id    — id of the category that will hold the new subcategory
--   p_new_index        — sort_order for the subcategory under the new parent
--   p_wrapper_id       — pre-generated UUID (text) for the wrapper group
--
-- Returns
--   success (bool), error (text). On failure the transaction rolls back.

create or replace function public.admin_convert_group_with_wrap(
    p_roadmap_id text,
    p_item_id text,
    p_new_parent_id text,
    p_new_index integer,
    p_wrapper_id text
) returns table(success boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source record;
    v_parent record;
    v_new_subcategory_type text;
    v_old_group_item_type text;
    v_now timestamptz := now();
begin
    -- Guard: wrapper id must differ from source id
    if p_wrapper_id = p_item_id then
        return query select false, 'wrapper_id must differ from item_id';
        return;
    end if;

    -- Guard: wrapper id must not already exist in this roadmap
    if exists (
        select 1 from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_wrapper_id
    ) then
        return query select false, 'wrapper_id already exists';
        return;
    end if;

    -- Load source — must exist and be a group
    select * into v_source
        from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_item_id;
    if not found then
        return query select false, format('source item "%s" not found', p_item_id);
        return;
    end if;
    if v_source.item_type <> 'group' then
        return query select false, format('source item_type must be group, got %s', v_source.item_type);
        return;
    end if;

    -- Load target parent — must exist and be a category
    select * into v_parent
        from public.roadmap_items
        where roadmap_id = p_roadmap_id and item_id = p_new_parent_id;
    if not found then
        return query select false, format('new parent "%s" not found', p_new_parent_id);
        return;
    end if;
    if v_parent.item_type <> 'category' then
        return query select false, format('new parent type must be category, got %s', v_parent.item_type);
        return;
    end if;

    -- Discriminator mapping: group_item_type → subcategory_type
    -- (Improvement collapses to Feature; other values pass through 1:1.)
    v_old_group_item_type := v_source.group_item_type;
    if v_old_group_item_type = 'Improvement' then
        v_new_subcategory_type := 'Feature';
    else
        v_new_subcategory_type := v_old_group_item_type;
    end if;

    -- Park source at sort_order = -1 so shifts don't collide
    update public.roadmap_items
        set sort_order = -1, updated_at = v_now
        where roadmap_id = p_roadmap_id and item_id = p_item_id;

    -- Shift old-parent siblings down (collapse the gap source leaves behind)
    update public.roadmap_items
        set sort_order = sort_order - 1, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id is not distinct from v_source.parent_item_id
            and sort_order > v_source.sort_order
            and item_id <> p_item_id;

    -- Shift new-parent siblings up (open the slot for source's new subcategory)
    update public.roadmap_items
        set sort_order = sort_order + 1, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id = p_new_parent_id
            and sort_order >= p_new_index
            and item_id <> p_item_id;

    -- Insert wrapper group as a child of the (still-group) source.
    -- Doing this BEFORE the source type change keeps the FK chain valid at
    -- every intermediate step: children point at source (group) until the
    -- very last re-parent step.
    insert into public.roadmap_items (
        roadmap_id, item_id, parent_item_id, sort_order, depth,
        item_type, name, group_item_type, status, status_mode, manual_status,
        progress, phase_ids, created_at, updated_at
    ) values (
        p_roadmap_id, p_wrapper_id, p_item_id, 0, v_source.depth,
        'group', v_source.name, v_old_group_item_type, 'None', 'manual', 'None',
        0, '[]'::jsonb, v_now, v_now
    );

    -- Re-parent the source's original children under the wrapper.
    -- Exclude the wrapper itself (we just inserted it as a child of source).
    update public.roadmap_items
        set parent_item_id = p_wrapper_id, updated_at = v_now
        where roadmap_id = p_roadmap_id
            and parent_item_id = p_item_id
            and item_id <> p_wrapper_id;

    -- Final update on source: retype + new parent + new sort/depth + swap
    -- discriminators + clear group_item_type.
    update public.roadmap_items
        set parent_item_id = p_new_parent_id,
            sort_order = p_new_index,
            depth = (v_parent.depth + 1),
            item_type = 'subcategory',
            subcategory_type = v_new_subcategory_type,
            group_item_type = null,
            updated_at = v_now
        where roadmap_id = p_roadmap_id and item_id = p_item_id;

    return query select true, null::text;
exception
    when others then
        -- The outer transaction will see failure; return structured error so
        -- the caller can log the reason.
        return query select false, sqlerrm;
end;
$$;
```

### - [ ] Step 2: Apply the migration locally

If using Supabase CLI:

```bash
npx supabase db push
```

Or if running against a local Postgres directly, pipe the file:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260416120000_admin_convert_group_with_wrap_rpc.sql
```

Expected: `CREATE FUNCTION` (no error).

### - [ ] Step 3: Sanity-check the RPC with a manual call

In a Supabase SQL editor or `psql`:

```sql
select * from public.admin_convert_group_with_wrap(
    'fake-roadmap', 'fake-item', 'fake-parent', 0, 'fake-wrapper'
);
```

Expected output: one row `(false, 'source item "fake-item" not found')`. This confirms the RPC exists and basic validation branches work.

### - [ ] Step 4: Commit

```bash
git add supabase/migrations/20260416120000_admin_convert_group_with_wrap_rpc.sql
git commit -m "feat(db): add admin_convert_group_with_wrap RPC

Atomic group → subcategory promotion that auto-creates a wrapper group
carrying the source's children. The FK chain stays valid at every step:
wrapper inserts as a child of the still-group source, children reparent
to wrapper, then source finally retypes to subcategory.

Refs: docs/superpowers/specs/2026-04-16-convert-group-with-children-to-subcategory-design.md §4.5

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Repo — delegate non-empty case to RPC

**Files:**
- Modify: `src/server/roadmapRowsRepo.ts:767-897` (the `convertItemType` function)

### - [ ] Step 1: Update the empty-check branch and add RPC delegation

Open `src/server/roadmapRowsRepo.ts`. Find the block at lines 799–812 that looks like:

```ts
    // 2. Emptiness check — count children rows directly in DB (cheap).
    const { count: childCount, error: cntErr } = await supabase
        .from('roadmap_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('roadmap_id', roadmapId)
        .eq('parent_item_id', itemId);
    if (cntErr) return { success: false, error: cntErr.message };
    if ((childCount ?? 0) > 0) {
        return {
            success: false,
            error: `Cannot convert: item has ${childCount} children. Remove them first.`,
            userError: true,
        };
    }
```

Replace it with:

```ts
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
```

### - [ ] Step 2: Delegate to RPC for the wrap case, keep the existing path for empty sources

Still in `convertItemType`, find step 3 ("New parent validation + depth resolution") at lines 814–842. **Before** that block — immediately after the new `sourceHasChildren` check added in Step 1 — insert:

```ts
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
```

### - [ ] Step 3: Extend the return type so the handler can read `wrapperId`

At the top of the file (the section that declares the return shape of `convertItemType`), update the signature on the function declaration at line 767 from:

```ts
): Promise<{ success: boolean; error?: string; userError?: boolean }> {
```

to:

```ts
): Promise<{ success: boolean; error?: string; userError?: boolean; wrapperId?: string }> {
```

Also add the `randomUUID` import at the top of the file. Find the first import block and add:

```ts
import { randomUUID } from 'crypto';
```

(If `crypto` is already imported, add `randomUUID` to the existing import clause instead of duplicating.)

### - [ ] Step 4: Typecheck

```bash
npx tsc --noEmit
```

Expected: exit code 0.

### - [ ] Step 5: Lint the changed file

```bash
npx eslint src/server/roadmapRowsRepo.ts
```

Expected: 0 errors. Pre-existing warnings (e.g., `NormalizedRoadmapRows`) are acceptable — only fail on new errors.

### - [ ] Step 6: Commit

```bash
git add src/server/roadmapRowsRepo.ts
git commit -m "feat(repo): delegate non-empty group convert to wrap RPC

convertItemType used to reject any source with children. It now permits
group → subcategory even when the source has children, routing that
case through admin_convert_group_with_wrap for atomic wrapper creation
and child re-parenting. Subcategory → group still requires an empty
source (schema does not allow groups inside a group).

Refs: docs/superpowers/specs/2026-04-16-convert-group-with-children-to-subcategory-design.md §4.5

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: API route — write `__wrapped__` changelog when wrapper was created

**Files:**
- Modify: `src/app/api/roadmap/[id]/admin-patch/route.ts:414-479` (the `handleConvertTypePatch` function)

### - [ ] Step 1: Capture `wrapperId` from the repo result and record it

Open `src/app/api/roadmap/[id]/admin-patch/route.ts`. In `handleConvertTypePatch`, locate the block that currently looks like:

```ts
    const result = await convertItemType(
        roadmapId,
        patch.itemId,
        patch.newType,
        patch.newParentItemId,
        Math.max(0, Math.floor(patch.newIndex)),
    );
    if (!result.success) {
        // … existing user-error / telemetry branch …
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
```

Immediately after the existing `insertItemChange` call (the `__converted__` one), add:

```ts
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
```

### - [ ] Step 2: Add `wrapperCreated` flag to the success telemetry

Still in `handleConvertTypePatch`, locate the `logRoadmapSaveTelemetry({ route: 'admin-patch', … outcome: 'success', … })` call at the end of the function. Add one field to that object:

```ts
    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId,
        outcome: 'success',
        status: 200,
        baseVersion: patch.baseVersion,
        serverVersion: persistedVersion,
        changeCount: 1,
        actor: auth.sessionUser,
        reason: result.wrapperId ? 'convert-with-wrap' : undefined,  // ← add
    });
```

(If the `logRoadmapSaveTelemetry` signature does not accept an extra `reason` field on success paths, leave the `reason` property off and skip this step. The changelog row is the canonical audit; telemetry is nice-to-have.)

### - [ ] Step 3: Typecheck

```bash
npx tsc --noEmit
```

Expected: exit code 0.

### - [ ] Step 4: Commit

```bash
git add src/app/api/roadmap/[id]/admin-patch/route.ts
git commit -m "feat(admin-patch): log __wrapped__ changelog for wrap converts

When convertItemType returns wrapperId, write an extra audit row tying
the auto-created wrapper back to its source. Read-side UIs filter
structural synthetic fields (__converted__, __wrapped__) the same way,
so no new UI branches are required.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Client validator — allow non-empty group → category

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx` (the `isValidConvertDrop` callback)

### - [ ] Step 1: Remove the `hasNoChildren` gate for group → category, keep it for subcategory → subcategory

Open `src/components/SpreadsheetGrid.tsx`. Search for the `isValidConvertDrop = useCallback(…)` definition. Find the block:

```ts
        // group → subcategory (dropped on category)
        if (source.type === 'group' && target.type === 'category') {
            if (!hasNoChildren(source)) {
                const n = source.children?.length ?? 0;
                return { ok: false, reason: `Không thể promote: group còn ${n} item${n === 1 ? '' : 's'}. Xoá hết trước.` };
            }
            return { ok: true, newType: 'subcategory' };
        }
```

Replace it with:

```ts
        // group → subcategory (dropped on category). Non-empty groups are
        // allowed: the server auto-wraps their children under a new group
        // carrying the same name. See spec §4.5.
        if (source.type === 'group' && target.type === 'category') {
            return { ok: true, newType: 'subcategory' };
        }
```

Leave the subcategory → group branch untouched — the `hasNoChildren` check there is still correct (cascade is out of scope).

### - [ ] Step 2: `hasNoChildren` may now be dead in this file — check

```bash
npx eslint src/components/SpreadsheetGrid.tsx 2>&1 | grep -E "hasNoChildren"
```

If ESLint flags it as an unused import, remove `hasNoChildren` from the import clause at the top of the file:

```ts
import {
    …,
    convertGroupToSubcategory, convertSubcategoryToGroup, hasNoChildren  // ← remove hasNoChildren
} from '@/utils/roadmapHelpers';
```

becomes

```ts
import {
    …,
    convertGroupToSubcategory, convertSubcategoryToGroup
} from '@/utils/roadmapHelpers';
```

**Do not** remove it from `roadmapHelpers.ts`; the subcategory → subcategory validator branch still uses it elsewhere.

Re-run `npx eslint src/components/SpreadsheetGrid.tsx` and confirm no new errors.

### - [ ] Step 3: Typecheck

```bash
npx tsc --noEmit
```

Expected: exit code 0.

### - [ ] Step 4: Commit

```bash
git add src/components/SpreadsheetGrid.tsx
git commit -m "feat(grid): allow drag-convert for non-empty groups → subcategory

Remove the client-side hasNoChildren gate on the group → category
direction. The repo / RPC now auto-wraps children, so the client no
longer needs to reject the drop. Red convert-blocked tooltip is still
shown for subcategory → subcategory with children (unchanged).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Client handler — use wrap helper for optimistic tree

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx` (the `convert` branch inside `handleDrop`)
- Modify: `src/components/SpreadsheetGrid.tsx` (imports)

### - [ ] Step 1: Import the new helper

At the top of `src/components/SpreadsheetGrid.tsx`, extend the `@/utils/roadmapHelpers` import clause to include `convertGroupToSubcategoryWithWrap`:

```ts
import {
    FlattenedItem, findNodeById, filterRoadmapTree, flattenRoadmap, getExpandedFlattenedRows,
    generateTimelineDays, updateNodeById, deleteNodeById, addChildToNode, reorderItems, touchItemTimestamp, moveNodeToParent,
    convertGroupToSubcategory, convertSubcategoryToGroup, convertGroupToSubcategoryWithWrap
} from '@/utils/roadmapHelpers';
```

(If Task 5 Step 2 already dropped `hasNoChildren`, the edit above adds the wrap helper on the same line where `hasNoChildren` used to live.)

### - [ ] Step 2: Branch on `source.children?.length` inside the convert handler

Inside `handleDrop`, find the `result.mode === 'convert'` branch. It currently reads:

```ts
            } else if (result.mode === 'convert') {
                const source = findNodeById(data.items, capturedDraggedId);
                const target = findNodeById(data.items, targetId);
                if (!source || !target) {
                    // … reset & return …
                }
                // … dialog …
                const converted = result.newType === 'subcategory'
                    ? convertGroupToSubcategory(source)
                    : convertSubcategoryToGroup(source);
                const touchedConverted = touchItemTimestamp(converted);
                const afterRemove = deleteNodeById(data.items, capturedDraggedId);
                const afterInsert = addChildToNode(afterRemove, targetId, touchedConverted);
                // …
            }
```

Replace the `const converted = …` line with the branching logic:

```ts
                let converted: RoadmapItem;
                if (result.newType === 'subcategory') {
                    const { subcategory } = convertGroupToSubcategoryWithWrap(
                        source,
                        () => crypto.randomUUID(),
                    );
                    converted = subcategory;
                } else {
                    converted = convertSubcategoryToGroup(source);
                }
```

Leave the rest of the convert branch (`deleteNodeById`, `addChildToNode`, `onAdminConvertType`, optimistic `setExpandedIds`) unchanged — the server owns the wrapper's real id, and `loadRoadmap()` after the API response reconciles the client tree.

### - [ ] Step 3: Confirm `convertGroupToSubcategory` is still referenced

If Step 2 removed the last usage of the single-item `convertGroupToSubcategory`, ESLint will flag it as unused. Check with:

```bash
npx eslint src/components/SpreadsheetGrid.tsx 2>&1 | grep convertGroupToSubcategory
```

If it is flagged, drop the import:

```ts
convertGroupToSubcategory, convertSubcategoryToGroup, convertGroupToSubcategoryWithWrap
```

becomes

```ts
convertSubcategoryToGroup, convertGroupToSubcategoryWithWrap
```

If it is **not** flagged (because some other code path uses it), leave the import alone.

### - [ ] Step 4: Typecheck + lint

```bash
npx tsc --noEmit && npx eslint src/components/SpreadsheetGrid.tsx
```

Expected: tsc exit 0; eslint shows only the pre-existing warnings (`addToast`, `TeamRole`, `<img>`, etc.) — no new errors.

### - [ ] Step 5: Commit

```bash
git add src/components/SpreadsheetGrid.tsx
git commit -m "feat(grid): optimistic wrap tree for non-empty group convert

handleDrop now uses convertGroupToSubcategoryWithWrap for the
group → subcategory direction, producing a client-side tree with the
wrapper group pre-populated. Server response via loadRoadmap()
reconciles the wrapper's id.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Verification — full typecheck, lint, and manual E2E

**Files:** none (verification-only).

### - [ ] Step 1: Full TypeScript check

```bash
npx tsc --noEmit
```

Expected: exit code 0, no output.

### - [ ] Step 2: Full ESLint on all modified files

```bash
npx eslint \
    src/utils/roadmapHelpers.ts \
    src/utils/roadmapHelpers.test.ts \
    src/server/roadmapRowsRepo.ts \
    src/app/api/roadmap/\[id\]/admin-patch/route.ts \
    src/components/SpreadsheetGrid.tsx
```

Expected: 0 errors; only pre-existing warnings allowed.

### - [ ] Step 3: Full unit test suite

```bash
npx vitest run
```

Expected: all tests pass, including the three new ones in `roadmapHelpers.test.ts`.

### - [ ] Step 4: Manual E2E checklist (dev server)

Start the dev server: `npm run dev`, login as admin, open a roadmap in table mode.

Execute each check and mark it done:

- [ ] Drag a group with children (BA/BE/QC teams inside) onto a category row → row highlights purple (not red).
- [ ] Release → dialog appears with the short text `Bạn có chắc muốn chuyển "{source.name}" từ Group thành Subcategory bên dưới "{target.name}"?`
- [ ] Click Confirm → toast "Đã lưu thành công"; the source now sits as a subcategory under the target category; a wrapper group with the source's original name appears as its sole child; BA/BE/QC teams are inside the wrapper.
- [ ] Reload the page → structure persists.
- [ ] Drag an empty group onto a category → behaviour unchanged; no wrapper appears.
- [ ] Drag a subcategory that still contains groups onto another subcategory → red convert-blocked tooltip; drop rejected (unchanged).
- [ ] Login as a non-admin manager → drag handle disabled on group rows (unchanged).
- [ ] With DevTools open, run the full drag on the wrapped case and confirm Network → `/admin-patch` returns 200 with body `{ success: true, updatedAt: … }`.

### - [ ] Step 5: Tag the rollout commit

After the E2E checklist passes, create a final tag commit to mark the feature as shipped:

```bash
git commit --allow-empty -m "chore(release): drag-convert group-with-children to subcategory

All seven tasks in docs/superpowers/plans/2026-04-16-convert-group-with-children-to-subcategory.md
verified: typecheck, lint, unit tests, manual E2E all green.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Rollback

If a bug is found after shipping:

1. **Client-only bug**: `git revert` the Task 6 + Task 5 commits. The server still accepts non-empty converts but no UI can trigger them; net effect = feature disabled.
2. **Server bug**: `git revert` Task 3 + Task 4 commits. `convertItemType` returns to its old behaviour (empty-only). The RPC stays in the database harmlessly.
3. **RPC bug**: no revert needed — the RPC is only called by Task 3's code path, which is already reverted in step 2.
