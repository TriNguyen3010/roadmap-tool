# Plan: Drag-and-Drop Convert Group ↔ Subcategory

**Ngày**: 2026-04-16
**Scope**: Table mode only
**Chế độ**: Admin-only (structural edit)

## 1. Mục tiêu

Cho phép admin drag-and-drop để **đổi type** của một item giữa `group` ↔ `subcategory` (kèm theo di chuyển parent), với điều kiện item RỖNG (không có children).

### Hai thao tác được hỗ trợ

| Source → Target | Hành vi | Điều kiện |
|-----------------|---------|-----------|
| `group` drag lên `category` row | Promote group → subcategory, nested dưới category đó | Source group phải không có children |
| `subcategory` drag lên `subcategory` row | Demote subcategory → group, nested dưới subcategory target | Source subcategory phải không có children |

### Ngoài scope

- ❌ Drop group/subcategory có children (UX chặn + dialog giải thích)
- ❌ JSON mode (chỉ table mode)
- ❌ Các chuyển đổi type khác (item ↔ group, team ↔ anything)
- ❌ Manager role (manager không được edit structure)

## 2. User flow

1. Admin mouse-down trên row `Send` (type=group, rỗng)
2. Drag lên row `App` (type=category)
3. UI highlight row `App` bằng màu riêng (VD: **tím**) + tooltip: *"Promote `Send` to subcategory under `App`"*
4. Admin release chuột
5. Dialog xác nhận: *"Bạn có chắc muốn chuyển `Send` từ **Group** thành **Subcategory** bên dưới `App`?"* — [Hủy] [Xác nhận]
6. Nếu xác nhận → call API → optimistic update + toast
7. Nếu API fail → rollback, hiện error toast

### Edge case UX

| Tình huống | Hành vi |
|------------|---------|
| Source group có children | Khi dragover target category, hiện tooltip đỏ *"Không thể promote: group còn X items. Xóa items trước."*, `dropEffect='none'` |
| Dialog user chọn Hủy | Không gọi API, reset DnD state |
| Convert thành công nhưng concurrent conflict (409) | Rollback, hiện toast *"Data đã thay đổi, đang reload..."*, gọi `loadRoadmap()` |

## 3. Kiến trúc kỹ thuật

### 3.1. Type system (`src/types/roadmapSave.ts`)

Thêm biến thể mới vào `RoadmapAdminItemPatchRequest`:

```ts
| {
    kind: 'convert-item-type';
    itemId: string;
    newType: 'subcategory' | 'group';
    newParentItemId: string | null;
    newIndex: number;
    baseVersion: string | null;
  }
```

### 3.2. Client helpers (`src/utils/roadmapHelpers.ts`)

Thêm 2 helpers pure:

```ts
export function convertGroupToSubcategory(item: RoadmapItem): RoadmapItem {
    // Map groupItemType → subcategoryType nếu overlap
    const nextSubType: SubcategoryType | undefined =
        item.groupItemType === 'Improvement' ? 'Feature' :
        item.groupItemType ? (item.groupItemType as SubcategoryType) : undefined;
    const { groupItemType, ...rest } = item;
    return { ...rest, type: 'subcategory', subcategoryType: nextSubType };
}

export function convertSubcategoryToGroup(item: RoadmapItem): RoadmapItem {
    const nextGroupType: GroupItemType | undefined = item.subcategoryType
        ? (item.subcategoryType as GroupItemType)
        : undefined;
    const { subcategoryType, ...rest } = item;
    return { ...rest, type: 'group', groupItemType: nextGroupType };
}
```

Và helper check emptiness:

```ts
export function hasNoChildren(item: RoadmapItem): boolean {
    return !item.children || item.children.length === 0;
}
```

### 3.3. DnD logic (`src/components/SpreadsheetGrid.tsx`)

**Thêm mode mới** vào `dragOverMode` state:

```ts
const [dragOverMode, setDragOverMode] = useState<
    'reorder' | 'parent' | 'convert' | null
>(null);
```

**Thêm validator** `isValidConvertDrop`:

```ts
const isValidConvertDrop = useCallback((sourceId: string, targetId: string): {
    ok: boolean;
    newType?: 'subcategory' | 'group';
    reason?: string;
} => {
    if (sourceId === targetId) return { ok: false };
    const source = flattened.find(i => i.id === sourceId);
    const target = flattened.find(i => i.id === targetId);
    if (!source || !target) return { ok: false };

    // group → subcategory (dropped on category)
    if (source.type === 'group' && target.type === 'category') {
        if (!hasNoChildren(source)) {
            return { ok: false, reason: `Group còn ${source.children?.length ?? 0} items, xóa trước` };
        }
        return { ok: true, newType: 'subcategory' };
    }

    // subcategory → group (dropped on another subcategory)
    if (source.type === 'subcategory' && target.type === 'subcategory') {
        if (source.id === target.id) return { ok: false };
        if (!hasNoChildren(source)) {
            return { ok: false, reason: `Subcategory còn ${source.children?.length ?? 0} groups, xóa trước` };
        }
        return { ok: true, newType: 'group' };
    }

    return { ok: false };
}, [flattened]);
```

**Cập nhật `getDropMode`** — thêm branch convert (priority THẤP hơn reorder/parent để không conflict):

```ts
const getDropMode = useCallback((sourceId: string, targetId: string) => {
    if (isValidSameLayerDrop(sourceId, targetId)) return { mode: 'reorder' as const };
    if (isValidParentDrop(sourceId, targetId)) return { mode: 'parent' as const };
    const convert = isValidConvertDrop(sourceId, targetId);
    if (convert.ok && convert.newType) return { mode: 'convert' as const, newType: convert.newType };
    return null;
}, [...]);
```

**Cập nhật `handleDrop`** — thêm branch 'convert':

```ts
} else if (dropResult.mode === 'convert') {
    const source = findNodeById(data.items, draggedId);
    if (!source) return;

    // Confirmation dialog
    const typeLabel = dropResult.newType === 'subcategory' ? 'Subcategory' : 'Group';
    const sourceLabel = source.type === 'group' ? 'Group' : 'Subcategory';
    const confirmed = await showConfirm(
        `Bạn có chắc muốn chuyển "${source.name}" từ ${sourceLabel} thành ${typeLabel} bên dưới "${target.name}"?`
    );
    if (!confirmed) {
        setDraggedId(null); setDragOverId(null); setDragOverMode(null);
        return;
    }

    // Build optimistic nextData
    const converted = dropResult.newType === 'subcategory'
        ? convertGroupToSubcategory(source)
        : convertSubcategoryToGroup(source);
    const afterRemove = deleteNodeById(data.items, draggedId);
    const afterInsert = addChildToNode(afterRemove, targetId, converted);
    const nextData = { ...data, items: afterInsert };

    if (onAdminConvertType) {
        // New parent = targetId, index = end of target.children
        const parent = findNodeById(afterInsert, targetId);
        const newIndex = (parent?.children?.length ?? 1) - 1;
        onAdminConvertType(draggedId, dropResult.newType, targetId, newIndex, nextData);
    } else {
        // JSON mode fallback (out of scope cho plan này, nhưng preserve behavior)
        onDataChange(nextData, true);
    }
}
```

### 3.4. UI visual feedback

Thêm style cho `dragOverMode === 'convert'` tại row render (khoảng line 2407-2450):

```tsx
const isDragOverConvert = dragOverId === row.id && dragOverMode === 'convert';
// className thêm:
${isDragOverConvert ? 'bg-purple-100 border-l-4 border-purple-500' : ''}
```

Và conditional tooltip khi invalid:

```tsx
{isDragOverConvertInvalid && (
    <div className="absolute ... text-red-600">
        {convertInvalidReason}
    </div>
)}
```

### 3.5. Client-side handler (`src/app/roadmap/[id]/page.tsx`)

Thêm `handleAdminConvertType`:

```ts
const handleAdminConvertType = useCallback(async (
    itemId: string,
    newType: 'subcategory' | 'group',
    newParentItemId: string | null,
    newIndex: number,
    nextData: RoadmapDocument,
) => {
    const prevData = data;
    setData(nextData); // optimistic

    try {
        const res = await fetch(`/api/roadmap/${roadmapId}/admin-patch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kind: 'convert-item-type',
                itemId,
                newType,
                newParentItemId,
                newIndex,
                baseVersion: currentVersion,
            }),
        });
        if (!res.ok) {
            if (res.status === 409) {
                await loadRoadmap(); // reload on conflict
                showToast('Data đã thay đổi, đã reload', 'warn');
                return;
            }
            throw new Error((await res.json()).error || 'Convert failed');
        }
        const payload = await res.json();
        setData(payload.document);
        setCurrentVersion(payload.updatedAt);
        showToast(`Đã chuyển ${newType === 'subcategory' ? 'thành subcategory' : 'thành group'}`, 'success');
    } catch (err) {
        setData(prevData); // rollback
        showToast(`Lỗi: ${String(err)}`, 'error');
    }
}, [data, roadmapId, currentVersion, loadRoadmap, showToast]);
```

Pass xuống grid:

```tsx
{...(storageMode === 'table' ? {
    onAdminAddItem: handleAdminAddItem,
    onAdminDeleteItem: handleAdminDeleteItem,
    onAdminMoveItem: handleAdminMoveItem,
    onAdminConvertType: handleAdminConvertType, // ← new
} : {})}
```

### 3.6. Server repo (`src/server/roadmapRowsRepo.ts`)

Thêm helper `convertItemType`:

```ts
export async function convertItemType(
    roadmapId: string,
    itemId: string,
    newType: 'subcategory' | 'group',
    newParentItemId: string | null,
    newIndex: number,
): Promise<{ success: boolean; error?: string }> {
    // 1. Load source — verify type & emptiness
    const { data: sourceRow, error: srcErr } = await supabase
        .from('roadmap_items')
        .select('parent_item_id, sort_order, depth, item_type, subcategory_type, group_item_type')
        .eq('roadmap_id', roadmapId).eq('item_id', itemId).maybeSingle();
    if (srcErr) return { success: false, error: srcErr.message };
    if (!sourceRow) return { success: false, error: `Item "${itemId}" not found` };

    const oldType = sourceRow.item_type as string;
    const expectedOldType = newType === 'subcategory' ? 'group' : 'subcategory';
    if (oldType !== expectedOldType) {
        return { success: false, error: `Item type mismatch: expected ${expectedOldType}, got ${oldType}` };
    }

    // Check emptiness
    const { count: childCount, error: cntErr } = await supabase
        .from('roadmap_items').select('item_id', { count: 'exact', head: true })
        .eq('roadmap_id', roadmapId).eq('parent_item_id', itemId);
    if (cntErr) return { success: false, error: cntErr.message };
    if ((childCount ?? 0) > 0) {
        return { success: false, error: `Cannot convert: item has ${childCount} children` };
    }

    // 2. Validate new parent hierarchy
    let newDepth = 0;
    let expectedParentType: string;
    if (newType === 'subcategory') expectedParentType = 'category';
    else expectedParentType = 'subcategory';

    if (newParentItemId) {
        const { data: parentRow, error: pErr } = await supabase
            .from('roadmap_items')
            .select('depth, item_type')
            .eq('roadmap_id', roadmapId).eq('item_id', newParentItemId).maybeSingle();
        if (pErr) return { success: false, error: pErr.message };
        if (!parentRow) return { success: false, error: `Parent "${newParentItemId}" not found` };
        if ((parentRow.item_type as string) !== expectedParentType) {
            return { success: false, error: `New parent type ${parentRow.item_type} invalid for ${newType}` };
        }
        newDepth = (parentRow.depth as number) + 1;
    }

    // 3. Swap discriminator fields
    const mappedSubType = newType === 'subcategory' ? (sourceRow.group_item_type || null) : null;
    const normSubType = mappedSubType === 'Improvement' ? 'Feature' : mappedSubType;
    const mappedGroupType = newType === 'group' ? (sourceRow.subcategory_type || null) : null;

    // 4. Reuse moveItem-like flow: park at -1, shift both sides, place at new slot
    //    Additional update: item_type, subcategory_type, group_item_type, depth
    const oldParentId = sourceRow.parent_item_id as string | null;
    const oldSortOrder = sourceRow.sort_order as number;

    // Park
    {
        const { error } = await supabase.from('roadmap_items')
            .update({ sort_order: -1 })
            .eq('roadmap_id', roadmapId).eq('item_id', itemId);
        if (error) return { success: false, error: `Park: ${error.message}` };
    }

    const down = await shiftSiblingsDown(roadmapId, oldParentId, oldSortOrder);
    if (!down.success) return down;

    const up = await shiftSiblingsUp(roadmapId, newParentItemId, newIndex);
    if (!up.success) return up;

    // Final update: parent + type + discriminators + depth
    {
        const { error } = await supabase.from('roadmap_items')
            .update({
                parent_item_id: newParentItemId,
                sort_order: newIndex,
                depth: newDepth,
                item_type: newType,
                subcategory_type: normSubType,
                group_item_type: mappedGroupType,
                updated_at: new Date().toISOString(),
            })
            .eq('roadmap_id', roadmapId).eq('item_id', itemId);
        if (error) return { success: false, error: `Final update: ${error.message}` };
    }

    return { success: true };
}
```

### 3.7. API route (`src/app/api/roadmap/[id]/admin-patch/route.ts`)

Thêm handler:

```ts
async function handleConvertTypePatch(
    roadmapId: string,
    patch: Extract<RoadmapAdminItemPatchRequest, { kind: 'convert-item-type' }>,
    auth: AuthenticatedRequest,
): Promise<NextResponse> {
    if (patch.newType !== 'subcategory' && patch.newType !== 'group') {
        return NextResponse.json({ error: 'Invalid newType' }, { status: 400 });
    }

    // CAS check
    const currentVersion = await loadRoadmapVersion(roadmapId);
    if (patch.baseVersion && patch.baseVersion !== currentVersion) {
        return NextResponse.json(
            buildVersionConflictPayload(currentVersion),
            { status: 409 }
        );
    }

    const result = await convertItemType(
        roadmapId,
        patch.itemId,
        patch.newType,
        patch.newParentItemId,
        patch.newIndex,
    );
    if (!result.success) {
        // Distinguish user error (has children / invalid parent) vs server error
        const isUserError = result.error?.includes('has') || result.error?.includes('mismatch') || result.error?.includes('invalid');
        return NextResponse.json(
            { error: result.error },
            { status: isUserError ? 400 : 500 }
        );
    }

    await insertItemChange(roadmapId, {
        itemId: patch.itemId,
        team: null,
        field: '__converted__',
        oldValue: patch.newType === 'subcategory' ? 'group' : 'subcategory',
        newValue: patch.newType,
        changedBy: auth.sessionUser.email,
        changedByLabel: auth.sessionUser.label,
    });

    await regenerateJsonBlob(roadmapId);
    const persistedVersion = await bumpAndRead(roadmapId);
    const document = await loadRoadmapDocumentFromRows(roadmapId);

    logRoadmapSaveTelemetry({
        route: 'admin-patch',
        roadmapId, outcome: 'success', status: 200,
        kind: 'convert-item-type', actor: auth.sessionUser,
    });

    return NextResponse.json({ success: true, document, updatedAt: persistedVersion });
}
```

Dispatch trong POST handler:

```ts
if (patch.kind === 'convert-item-type') {
    return handleConvertTypePatch(roadmapId, patch, auth);
}
```

## 4. Testing

### 4.1. Unit tests

**File**: `src/utils/roadmapHelpers.test.ts`

- [ ] `convertGroupToSubcategory`: type swap, discriminator map (Feature→Feature, Improvement→Feature, Bug→Bug, Growth Camp→Growth Camp)
- [ ] `convertSubcategoryToGroup`: reverse
- [ ] `hasNoChildren`: empty/undefined/children=[] → true; children=[...] → false

### 4.2. Repo test

**File**: `src/server/roadmapRowsRepo.test.ts` (hoặc tạo mới)

- [ ] Convert group empty → subcategory: verify DB state (item_type, discriminators, depth, sort_order, parent)
- [ ] Convert group có children → reject với error message
- [ ] Convert với wrong expected parent type → reject
- [ ] Sibling shift cả 2 bên: verify old parent's remaining siblings + new parent's siblings
- [ ] Subcategory → group (inverse): same coverage

### 4.3. API integration test

**File**: `src/app/api/roadmap/admin-patch.route.test.ts`

- [ ] POST kind=convert-item-type với group empty → 200 + document reload có type=subcategory
- [ ] POST với group có children → 400 + error msg
- [ ] POST với baseVersion stale → 409 conflict payload
- [ ] POST manager auth → 403 (admin-only)
- [ ] Verify changelog có entry `__converted__`

### 4.4. E2E manual test (checklist)

- [ ] Admin drag group RỖNG lên category → purple highlight + tooltip
- [ ] Release → dialog xác nhận hiện đúng text
- [ ] Confirm → UI update optimistic, API 200, row hiện dưới category mới như subcategory
- [ ] Reload page → data persist đúng
- [ ] Admin drag group CÓ children lên category → tooltip đỏ, không drop được
- [ ] Admin drag subcategory RỖNG lên subcategory khác → dialog → demote thành group
- [ ] Cancel dialog → không có gì thay đổi
- [ ] Concurrent: admin A convert, admin B save → B thấy 409, reload thấy convert của A
- [ ] Manager login → drag disabled (không có handle)
- [ ] Changelog có entry `__converted__`

## 5. Rollout

### 5.1. Feature flag

- Không cần flag — chức năng pure additive, không làm vỡ flow hiện tại
- Nếu bug phát hiện production → có thể disable bằng cách không wire prop `onAdminConvertType` trong page.tsx

### 5.2. Migration

- Không cần DB migration — tất cả columns (`item_type`, `subcategory_type`, `group_item_type`, `depth`) đã tồn tại
- Không cần RPC change

### 5.3. Thứ tự deploy

1. Merge types + helpers (Phase 3.1, 3.2) — backward compatible
2. Merge backend (3.6, 3.7)
3. Merge client handler (3.5)
4. Merge DnD UI (3.3, 3.4) — feature live

## 6. Tiêu chí hoàn tất

Plan được xem là hoàn tất khi:

- [ ] Drag group RỖNG lên category row → dialog confirm → chuyển thành subcategory thành công
- [ ] Drag subcategory RỖNG lên subcategory khác → dialog confirm → chuyển thành group thành công
- [ ] Drag item có children → hiển thị tooltip giải thích, không cho drop
- [ ] Manager role không drag được (giữ nguyên behavior hiện tại)
- [ ] Concurrent 409 rollback + reload hoạt động
- [ ] Changelog `__converted__` ghi đầy đủ old/new type
- [ ] Unit + integration + E2E checklist đều pass
- [ ] Không regression: drag reorder / cross-parent move hiện tại vẫn hoạt động bình thường

## 7. Rủi ro & Giảm thiểu

| Rủi ro | Xác suất | Giảm thiểu |
|--------|----------|------------|
| User vô tình convert group thành subcategory | Thấp | Dialog xác nhận + rõ text |
| Depth mismatch do race condition | Thấp | CAS baseVersion; refetch depth từ parent trong `convertItemType` |
| Discriminator mapping sai (Improvement → ?) | Trung bình | Unit test bao phủ mọi case; UI có thể cho user re-select subcategoryType sau convert |
| User expect convert khi có children (MVP không support) | Cao | Error message rõ ràng + doc hướng dẫn xóa children trước |
| Sibling shift edge case với parent=null (root-level) | Thấp | `shiftSiblingsDown/Up` đã handle `parentId: null` cho admin-add-item, reuse |

## 8. Future work (out of scope plan này)

- **Auto-wrap**: cho convert group có children bằng cách tự tạo một default subgroup
- **Cascade convert**: items trong group tự promote thành groups khi parent convert
- **JSON mode support**
- **Bulk convert**: select nhiều items rồi batch convert
- **Inverse khác**: item → group (đổi type sang container)
