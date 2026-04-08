# Plan: Auto-save cho Priority, Delete item, Add child

## Vấn đề

3 hành động này chỉ cập nhật local state, không gọi API save. User phải bấm nút Save trên toolbar.

---

## 1. Đổi Priority

### Hiện tại

```tsx
// SpreadsheetGrid.tsx line 3386
updateFromSource(activeRow.id, source => ({ ...source, priority: p }));

// line 3394 (clear priority)
updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; });
```

`updateFromSource` có `shouldSave = false` mặc định → không auto-save.

### Sửa

Thêm `true` làm tham số thứ 3:

```diff
// line 3386
- updateFromSource(activeRow.id, source => ({ ...source, priority: p }));
+ updateFromSource(activeRow.id, source => ({ ...source, priority: p }), true);

// line 3394
- updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; });
+ updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; }, true);
```

---

## 2. Delete item

### Hiện tại

```tsx
// SpreadsheetGrid.tsx line 1174
onDataChange({ ...data, items: deleteNodeById(data.items, id) });
```

Không truyền `shouldSave = true`.

### Sửa

```diff
// line 1174
- onDataChange({ ...data, items: deleteNodeById(data.items, id) });
+ onDataChange({ ...data, items: deleteNodeById(data.items, id) }, true);
```

---

## 3. Add child

### Hiện tại

```tsx
// SpreadsheetGrid.tsx line 1187
onDataChange({ ...data, items: newItems });

// page.tsx line 1376 (handleRootAdd — thêm category root)
setData(stripViewSettingsFromDocument(normalizeDocument({ ...data, items: [...data.items, newItem] })));
setHasUnsavedSharedChanges(true);
```

Cả 2 đều không auto-save.

### Sửa

**SpreadsheetGrid.tsx:**
```diff
// line 1187
- onDataChange({ ...data, items: newItems });
+ onDataChange({ ...data, items: newItems }, true);
```

**page.tsx (handleRootAdd):**
```diff
// line 1373-1378
  const handleRootAdd = (newItem: RoadmapItem) => {
      if (!ensureCanManageRoadmap()) return;
      if (!data) return;
-     setData(stripViewSettingsFromDocument(normalizeDocument({ ...data, items: [...data.items, newItem] })));
-     setHasUnsavedSharedChanges(true);
-     setHasPendingReleaseMetaPatch(false);
+     const normalized = normalizeDocument({ ...data, items: [...data.items, newItem] });
+     setData(stripViewSettingsFromDocument(normalized));
+     setHasUnsavedSharedChanges(true);
+     setHasPendingReleaseMetaPatch(false);
+     handleSave(normalized);
  };
```

---

## Tổng kết thay đổi

| File | Dòng | Hành động |
|---|---|---|
| SpreadsheetGrid.tsx | 3386 | Priority set → thêm `true` |
| SpreadsheetGrid.tsx | 3394 | Priority clear → thêm `true` |
| SpreadsheetGrid.tsx | 1174 | Delete → thêm `true` |
| SpreadsheetGrid.tsx | 1187 | Add child → thêm `true` |
| page.tsx | 1373-1378 | Root add → gọi `handleSave` |
