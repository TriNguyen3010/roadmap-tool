# Plan: Auto-save cho Priority

## Vấn đề

Đổi Priority chỉ cập nhật local state, không gọi API save.

## Thay đổi

### File: `src/components/SpreadsheetGrid.tsx`

#### 1. Set priority (line 3386)

```diff
- updateFromSource(activeRow.id, source => ({ ...source, priority: p }));
+ updateFromSource(activeRow.id, source => ({ ...source, priority: p }), true);
```

#### 2. Clear priority (line 3394)

```diff
- updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; });
+ updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; }, true);
```
