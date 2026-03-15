# Plan: Thêm 4 status mới + Xóa status Done cũ

## Tóm tắt

| Thay đổi | Chi tiết |
|---|---|
| **Thêm** | `Dev Done`, `Done - Dev Env`, `Done - Prod Env`, `Sếp Vinh` |
| **Xóa** | `Done` |
| **Migration** | Dữ liệu JSON cũ `"Done"` → normalize sang `Done - Prod Env` |

**Nghĩa của các status mới:**
- `Dev Done` — dev đã làm xong, chưa deploy lên môi trường nào
- `Done - Dev Env` — đã deploy và xong trên môi trường Dev
- `Done - Prod Env` — đã deploy và xong trên Production (= "Done" thật sự)
- `Sếp Vinh` — issue này đang được sếp Vinh handle trực tiếp (không thuộc flow team thông thường)

---

## Danh sách status sau thay đổi (15 status)

```
 1. Not Started
 2. Sếp Vinh          ← MỚI
 3. BA Handle
 4. BA In Progress
 5. PD Handle
 6. PD In Progress
 7. QC Handle
 8. QC In Progress
 9. Growth Handle
10. Growth In Progress
11. Dev Handle
12. Dev In Progress
13. Dev Done          ← MỚI
14. Done - Dev Env    ← MỚI
15. Done - Prod Env   ← MỚI (thay thế Done cũ)
```

---

## Phạm vi ảnh hưởng

### 1. `src/types/roadmap.ts`

**`ItemStatus` union:** Xóa `'Done'`, thêm 4 status mới.

**`STATUS_OPTIONS`:** Xóa `'Done'`, sắp xếp lại toàn bộ theo thứ tự mới (`Sếp Vinh` lên sau `Not Started`, QC/Growth trước Dev, 3 Done-family cuối):
```typescript
STATUS_OPTIONS = [
  'Not Started',
  'Sếp Vinh',
  'BA Handle', 'BA In Progress',
  'PD Handle', 'PD In Progress',
  'QC Handle', 'QC In Progress',
  'Growth Handle', 'Growth In Progress',
  'Dev Handle', 'Dev In Progress',
  'Dev Done',
  'Done - Dev Env',
  'Done - Prod Env',
];
```

**`normalizeItemStatus` — migration dữ liệu cũ:**
```typescript
if (status === 'In Progress') return 'Dev In Progress'; // đã có
if (status === 'Done') return 'Done - Prod Env';        // ← MỚI (migration)
```

---

### 2. `src/components/SpreadsheetGrid.tsx`

Xóa entry `'Done'` trong 3 map màu, thêm 4 entry mới:

| Status | STATUS_BAR_COLOR | STATUS_TAG_BG | STATUS_TAG_TEXT |
|---|---|---|---|
| `Dev Done` | `#15803d` | `#dcfce7` | `#14532d` |
| `Done - Dev Env` | `#0ea5e9` | `#e0f2fe` | `#0c4a6e` |
| `Done - Prod Env` | `#16a34a` | `#bbf7d0` | `#166534` |
| `Sếp Vinh` | `#f43f5e` | `#ffe4e6` | `#9f1239` |

> `Done - Prod Env` kế thừa màu xanh lá của `Done` cũ để giữ visual quen thuộc.

---

### 3. `src/utils/roadmapHelpers.ts`

**`deriveStatusFromChildren`:** Mở rộng "all done" sang 3 status mới:
```typescript
const DONE_STATUSES: ItemStatus[] = ['Done - Prod Env', 'Done - Dev Env', 'Dev Done'];
const allDone = normalizedStatuses.every(s => DONE_STATUSES.includes(s));
if (allDone) return 'Done - Prod Env';   // parent bubble up mức cao nhất

// Thêm vào precedence chain (sau Dev In Progress, trước PD In Progress):
if (hasStatus('Dev Done')) return 'Dev Done';

// Mixed Done family + Not Started:
if (DONE_STATUSES.some(ds => hasStatus(ds))) return 'Dev In Progress';
```

> `Sếp Vinh` **không tham gia auto-derive** — chỉ set manual.

**`recalculateItem` — progress tự động:**
```typescript
// Cũ: effectiveStatus === 'Done'
// Mới:
if (effectiveStatus === 'Done - Prod Env') progress = 100;
```

---

### 4. `src/components/EditPopup.tsx`

```typescript
// Cũ: if (s === 'Done') setProgress(100);
// Mới:
if (s === 'Done - Prod Env') setProgress(100);
```

---

### 5. `src/utils/exportToExcel.ts`

```typescript
// Cũ:
const SUMMARY_GROUP_STATUSES = ['Dev Handle', 'Dev In Progress', 'Not Started', 'Done'];
const SUMMARY_DEV_TEAM_STATUSES = ['Dev Handle', 'Dev In Progress', 'Done'];

// Mới:
const SUMMARY_GROUP_STATUSES = [
  'Dev Handle', 'Dev In Progress', 'Not Started',
  'Dev Done', 'Done - Dev Env', 'Done - Prod Env',
];
const SUMMARY_DEV_TEAM_STATUSES = [
  'Dev Handle', 'Dev In Progress',
  'Dev Done', 'Done - Dev Env', 'Done - Prod Env',
];
```

> `Sếp Vinh` không thêm vào summary groups.

---

### 6. `FilterPopup.tsx` / `AddNodePopup.tsx`

- **FilterPopup**: tự động nhận status mới qua `STATUS_OPTIONS`. Không cần sửa thêm.
- **AddNodePopup**: default `Not Started`. Không cần sửa.

---

## Migration dữ liệu cũ

| JSON cũ | Normalize thành | Ghi chú |
|---|---|---|
| `"Done"` | `Done - Prod Env` | Thêm vào `normalizeItemStatus` |
| `"In Progress"` | `Dev In Progress` | Đã có từ trước |
| Status không hợp lệ | `Not Started` | Đã có từ trước |

Không cần migrate JSON thủ công. Normalize tự động khi load data.

---

## Kế hoạch triển khai

### Phase 1 — Core type model
1. Cập nhật `ItemStatus` union, `STATUS_OPTIONS`, `normalizeItemStatus` trong `roadmap.ts`

### Phase 2 — UI màu sắc
1. Cập nhật 3 màu map trong `SpreadsheetGrid.tsx`

### Phase 3 — Logic & side effects
1. Cập nhật `deriveStatusFromChildren` trong `roadmapHelpers.ts`
2. Cập nhật progress logic trong `recalculateItem`
3. Cập nhật `EditPopup.tsx` (setProgress khi chọn Done - Prod Env)

### Phase 4 — Export
1. Cập nhật `SUMMARY_GROUP_STATUSES` và `SUMMARY_DEV_TEAM_STATUSES` trong `exportToExcel.ts`

### Phase 5 — QA
1. `npm run test && npm run build && npm run lint`
2. Test thủ công: dropdown, màu tag, migration JSON cũ, export Excel

---

## Acceptance criteria

1. 15 status hiển thị đầy đủ, không còn `Done` cũ
2. JSON cũ có `"Done"` load lên hiển thị `Done - Prod Env` với progress = 100%
3. `Done - Prod Env` tag màu xanh lá (giống Done cũ), `Sếp Vinh` tag đỏ hồng
4. Export Excel Summary có `Dev Done`, `Done - Dev Env`, `Done - Prod Env` đúng block
5. `npm run build` không lỗi TypeScript
