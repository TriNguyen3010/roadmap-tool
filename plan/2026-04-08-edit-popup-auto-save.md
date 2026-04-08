# Plan: Nút Lưu trong EditPopup auto-save

## Vấn đề

Khi admin bấm "Lưu" trong EditPopup, data chỉ cập nhật local state mà **không gọi API save**. User phải bấm thêm nút Save trên toolbar → gây nhầm lẫn, dễ mất data.

## Nguyên nhân

`handleEditSave` và `handleAddChild` gọi `onDataChange(data)` **không truyền `shouldSave = true`**:

```tsx
// SpreadsheetGrid.tsx line 1164-1170
const handleEditSave = (updated: RoadmapItem) => {
    if (!canEditStructure) return;
    onDataChange({ ...data, items: updateNodeById(data.items, updated.id, touchItemTimestamp(updated)) });
    //                                                                                    ↑ thiếu , true
};

// SpreadsheetGrid.tsx line 1176-1188
const handleAddChild = (parentId: string, newItem: RoadmapItem) => {
    // ...
    onDataChange({ ...data, items: newItems });
    //                                      ↑ thiếu , true
};
```

Trong khi đó, `handleDataChange` trong page.tsx chỉ gọi API khi `shouldSave = true`:

```tsx
// page.tsx line 1362-1371
const handleDataChange = (newData, shouldSave?) => {
    setData(normalized);
    setHasUnsavedSharedChanges(true);
    if (shouldSave) { handleSave(normalized); }  // chỉ save khi true
};
```

## Thay đổi

### File: `src/components/SpreadsheetGrid.tsx`

#### 1. `handleEditSave` (line 1166)

```diff
- onDataChange({ ...data, items: updateNodeById(data.items, updated.id, touchItemTimestamp(updated)) });
+ onDataChange({ ...data, items: updateNodeById(data.items, updated.id, touchItemTimestamp(updated)) }, true);
```

#### 2. `handleAddChild` (line 1187)

```diff
- onDataChange({ ...data, items: newItems });
+ onDataChange({ ...data, items: newItems }, true);
```

#### 3. `handleDelete` (line 1174)

```diff
- onDataChange({ ...data, items: deleteNodeById(data.items, id) });
+ onDataChange({ ...data, items: deleteNodeById(data.items, id) }, true);
```

### File: `src/app/roadmap/[id]/page.tsx`

#### 4. `handleRootAdd` (line 1376) — thêm category mới ở root

```diff
- setData(stripViewSettingsFromDocument(normalizeDocument({ ...data, items: [...data.items, newItem] })));
- setHasUnsavedSharedChanges(true);
+ const normalized = normalizeDocument({ ...data, items: [...data.items, newItem] });
+ setData(stripViewSettingsFromDocument(normalized));
+ setHasUnsavedSharedChanges(true);
+ handleSave(normalized);
```

## Tác động

- EditPopup bấm "Lưu" → auto-save ngay
- Add child (thêm team, group, sub...) → auto-save ngay
- Delete item → auto-save ngay
- Thêm category root → auto-save ngay
- Hành vi nhất quán với status/date/note đã auto-save

## Không ảnh hưởng

- Manager flow: manager không có `canEditStructure`, không chạy vào các hàm này
- Inline field edits (status, date, note): đã auto-save, không đổi
- Milestones/Release name: vẫn dùng endpoint PATCH riêng, không đổi
