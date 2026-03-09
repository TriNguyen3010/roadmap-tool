# Plan Check: Worktype (Re-check sau khi đổi `feature` -> `item`)

## Mục tiêu
- Chốt lại hướng triển khai `worktype` nhất quán với code hiện tại.
- Tránh xung đột giữa phân cấp cây (`category/subcategory/group/item/team`) và phân loại nghiệp vụ.
- Bổ sung đầy đủ 4 nhóm: `Feature`, `Improvement`, `Bug`, `Growth Camp`.

## Kết quả kiểm tra hiện trạng
- Đã đổi cây sang `group -> item` (không còn dùng `feature` trong runtime).
- `worktype` hiện đang nằm ở `subcategoryType` (chưa có field `workType` riêng ở `group/item`).
- `subcategoryType` hiện mới có 3 giá trị: `Feature`, `Bug`, `Growth Camp` (chưa có `Improvement`).
- Chưa có normalize alias `Bugs -> Bug`.
- Filter hiện tại đang lọc theo **tên Subcategory** (`filterSubcategory`), chưa có filter theo **loại worktype**.

## Quyết định thiết kế (chốt)
- Phase này dùng **1 nguồn sự thật**: `subcategoryType` chính là worktype ở cấp nghiệp vụ.
- Không thêm field `workType` vào `group/item` trong phase này.
- Không cho set worktype ở `group/item` để tránh conflict cha/con.

## Phạm vi
Bao gồm:
1. Mở rộng enum `subcategoryType` thêm `Improvement`.
2. Normalize dữ liệu cũ (`Bugs -> Bug`).
3. Bổ sung filter theo worktype (type-based), tách biệt filter theo tên Subcategory.
4. Cập nhật UI badge/màu cho `Improvement`.

Không bao gồm:
- Rollout `workType` ở `group/item`.
- Inheritance/override nhiều tầng cho worktype.
- Report/KPI chuyên sâu theo worktype.

## Kế hoạch triển khai

### Bước 1: Data model + normalize
- `src/types/roadmap.ts`
  - Update `SubcategoryType` thành:
    - `Feature | Improvement | Bug | Growth Camp`
  - Thêm `SUBCATEGORY_TYPE_OPTIONS`.
  - Thêm `normalizeSubcategoryType(value)`:
    - map `Bugs -> Bug`
    - chấp nhận 4 giá trị chuẩn
  - Thêm `normalizeSubcategoryTypeFilter(values)`.

### Bước 2: Chuẩn hóa khi load
- `src/app/page.tsx`
  - Trong `normalizeItemTree`, normalize `item.subcategoryType` bằng helper mới.
  - Thêm state/filter setting mới: `filterSubcategoryType` (không thay thế `filterSubcategory` hiện có).
  - Save/load `settings.filterSubcategoryType`.

### Bước 3: Edit UI cho subcategory
- `src/components/EditPopup.tsx`
  - Thêm option `Improvement` vào `SUBCATEGORY_TYPES`.
  - Thêm style màu cho `Improvement`.
  - Giữ nguyên nguyên tắc: chỉ chỉnh loại tại node `subcategory`.

### Bước 4: Grid badge
- `src/components/SpreadsheetGrid.tsx`
  - Thêm màu badge `Improvement`.
  - Vẫn chỉ hiển thị badge tại dòng `subcategory` (không nhồi badge vào `group/item`).

### Bước 5: Filter UI
- `src/components/FilterPopup.tsx`
  - Thêm group mới: `Worktype` (multi-select) dùng enum chuẩn.
  - Giữ filter `Subcategory` theo tên như hiện tại.
  - `onFilterChange` mở rộng thêm type `subcategoryType`.

### Bước 6: Filter logic
- `src/utils/roadmapHelpers.ts`
  - Mở rộng `filterRoadmapTree` nhận `subcategoryType?: string[]`.
  - Rule:
    - OR trong nhóm `subcategoryType`.
    - AND với nhóm filter khác.
    - Với node con của subcategory match, vẫn giữ branch để hiển thị tree.

### Bước 7: Backward compatibility + regression
- Dữ liệu cũ:
  - `subcategoryType = Bugs` -> normalize thành `Bug`.
  - Dữ liệu không có `subcategoryType` -> giữ `undefined`.
- Kiểm tra:
  - set `Improvement` trong Edit popup.
  - badge `Improvement` hiển thị đúng.
  - filter theo worktype chạy đúng độc lập và khi kết hợp phase/status/priority/team.
  - `npm run lint` và `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro trùng nghĩa giữa “Subcategory name filter” và “Worktype filter”.
  - Giảm thiểu: tách section rõ ràng trong FilterPopup (`Subcategory` vs `Worktype`).
- Rủi ro user kỳ vọng gán worktype ở `item/group`.
  - Giảm thiểu: ghi rõ đây là phase 1, chưa mở gán nhiều tầng.

## Tiêu chí hoàn tất
1. Có thể gán `Improvement` cho `subcategory`.
2. Có normalize `Bugs -> Bug`.
3. Có filter theo `Worktype` và hoạt động đúng với tree.
4. Save/load giữ đúng dữ liệu và settings filter mới.
