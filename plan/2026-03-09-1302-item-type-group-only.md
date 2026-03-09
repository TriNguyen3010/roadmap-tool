# Plan: Item Type chỉ áp dụng cho Group

## Mục tiêu
- Làm rõ quy tắc: `Item type` là metadata nghiệp vụ **chỉ dành cho node `group`**.
- Tránh nhầm lẫn với trường cấu trúc cây `type` (`category/subcategory/group/item/team`).
- Hỗ trợ lọc và hiển thị nhất quán theo `group`.

## Quyết định thiết kế
- Dùng enum mới: `GroupItemType = 'Feature' | 'Improvement' | 'Bug' | 'Growth Camp'`.
- Dùng field trên `RoadmapItem`: `groupItemType?: GroupItemType`.
- Rule áp dụng:
  - `group`: có thể set/clear `groupItemType`.
  - `category/subcategory/item/team`: không cho set trực tiếp.

## Phạm vi
Bao gồm:
1. Data model + normalize cho `groupItemType`.
2. Edit UI chỉ mở cho `group`.
3. Hiển thị badge `groupItemType` tại dòng `group`.
4. Filter theo `groupItemType`.
5. Save/load và backward compatibility cơ bản.

Không bao gồm:
- Set `item type` ở `item` hoặc `team`.
- Quy tắc override nhiều tầng.
- Báo cáo nâng cao theo item type.

## Kế hoạch triển khai

### Bước 1: Types + normalize
- `src/types/roadmap.ts`
  - Thêm:
    - `type GroupItemType = 'Feature' | 'Improvement' | 'Bug' | 'Growth Camp'`
    - `GROUP_ITEM_TYPE_OPTIONS`
    - `normalizeGroupItemType(value)`
    - `normalizeGroupItemTypeFilter(values)`
  - Mở rộng `RoadmapItem` với `groupItemType?: GroupItemType`.
  - Chuẩn hóa alias cũ nếu có:
    - `Bugs -> Bug`.

### Bước 2: Normalize khi load
- `src/app/page.tsx`
  - Trong `normalizeItemTree`: normalize `groupItemType`.
  - Đảm bảo nếu node khác `group` có `groupItemType` thì loại bỏ ở runtime (guard rule).
  - Thêm state/filter setting mới: `filterGroupItemType`.
  - Persist `settings.filterGroupItemType`.

### Bước 3: Edit UI (group-only)
- `src/components/EditPopup.tsx`
  - Hiển thị block chọn `Item type` chỉ khi `item.type === 'group'`.
  - Có `Clear` để bỏ gán.
  - Khi save:
    - `group`: lưu `groupItemType`.
    - node khác: không lưu field này.

### Bước 4: Grid hiển thị
- `src/components/SpreadsheetGrid.tsx`
  - Hiển thị badge `groupItemType` chỉ trên dòng `group`.
  - Thêm màu cho 4 loại:
    - `Feature`: xanh dương
    - `Improvement`: vàng/cam
    - `Bug`: đỏ
    - `Growth Camp`: xanh lá
  - Giữ layout gọn, không làm tăng chiều cao row.

### Bước 5: Filter UI + logic
- `src/components/FilterPopup.tsx`
  - Thêm nhóm `Item type (Group)` multi-select.
- `src/utils/roadmapHelpers.ts`
  - Mở rộng `filterRoadmapTree` nhận `groupItemType`.
  - Rule filter:
    - OR trong nhóm `groupItemType`.
    - AND với các filter khác.
    - Khi `group` match, giữ subtree của group.
    - Node cha (`subcategory/category`) được giữ nếu có descendant match.

### Bước 6: Backward compatibility
- Nếu dữ liệu cũ có `workType`/`groupItemType` ở `group`: normalize vào `groupItemType`.
- Nếu field này xuất hiện ở node khác `group`: bỏ qua khi load và khi save.
- Không tự động migrate từ `subcategoryType` sang `groupItemType` để tránh suy diễn sai.

### Bước 7: Regression test
- Luồng chỉnh sửa:
  - Set/Clear `Item type` trên `group`.
  - Không thấy field này ở `subcategory/item/team`.
- Luồng hiển thị:
  - Badge chỉ hiện ở `group`.
- Luồng filter:
  - Filter `groupItemType` hoạt động độc lập và kết hợp với phase/status/priority/team.
- Chất lượng:
  - `npm run lint`
  - `npm run build`

## Rủi ro và giảm thiểu
- Rủi ro nhầm `ItemType` (type cấu trúc) và `Item type` (nghiệp vụ).
  - Giảm thiểu: đặt tên code là `groupItemType`.
- Rủi ro dữ liệu cũ chứa field sai cấp.
  - Giảm thiểu: normalize guard theo `item.type === 'group'`.

## Tiêu chí hoàn tất
1. Chỉ `group` có thể chỉnh `Item type`.
2. Badge hiển thị đúng ở `group`.
3. Filter `Item type (Group)` chạy đúng.
4. Save/load ổn định, không rò field sang node khác.
