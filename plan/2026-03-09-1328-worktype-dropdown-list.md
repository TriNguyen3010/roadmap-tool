# Plan: Cho phép chỉnh WorkType bằng dropdown list

## Mục tiêu
- Cho phép user chỉnh `WorkType` bằng **dropdown list** thay vì thao tác rời rạc.
- Tối ưu thao tác nhanh ngay trên cột `WorkType`.
- Giữ rule hiện tại: chỉ node `group` mới có `groupItemType`.

## Quyết định thiết kế
- Dropdown chính nằm ở **cell cột WorkType** trong `SpreadsheetGrid` (inline quick edit).
- Node `group`:
  - Click cell mở dropdown.
  - Chọn 1 trong `Feature | Improvement | Bug | Growth Camp`.
  - Có `Clear` để bỏ gán.
- Node không phải `group`: không cho mở dropdown.
- Viewer mode: không cho chỉnh.

## Phạm vi
Bao gồm:
1. Dropdown inline trong cột `WorkType`.
2. Cập nhật data qua `updateFromSource` + `onDataChange` như các cell chỉnh nhanh khác.
3. UX đóng dropdown khi click ngoài hoặc nhấn `Escape`.

Không bao gồm:
- Thay đổi data model.
- Cho phép chỉnh WorkType ở `item/team/subcategory/category`.

## Kế hoạch triển khai

### Bước 1: State dropdown
- `src/components/SpreadsheetGrid.tsx`
  - Thêm state `openWorkTypeId: string | null`.
  - Khi mở dropdown WorkType, đóng `openPriorityId` và `openPhaseId` để tránh chồng menu.

### Bước 2: Outside click + Escape
- Thêm `useEffect` tương tự Priority/Phase:
  - Đóng dropdown nếu click ngoài `[data-worktype-dropdown]` và `[data-worktype-trigger]`.
  - Đóng khi `Escape`.

### Bước 3: Render dropdown trong cell WorkType
- Ở cell WorkType:
  - Nếu `row.type === 'group'` và `canEdit`, cell có `cursor-pointer`.
  - Click mở dropdown list.
  - Dropdown render 4 options + `Clear`.
- Chọn option:
  - `updateFromSource(row.id, source => ({ ...source, groupItemType: option }))`
- Clear:
  - Xóa field `groupItemType`.

### Bước 4: Đồng bộ popup Edit (khuyến nghị)
- `src/components/EditPopup.tsx`
  - Nếu muốn thống nhất hoàn toàn UI “dropdown list”, đổi block `Item type` từ chip buttons sang `<select>`.
  - Giữ giá trị và logic save hiện tại.

### Bước 5: Regression test
- Group row:
  - Mở dropdown, chọn value, hiển thị ngay trong cell.
  - Clear value hoạt động.
- Non-group row:
  - Không mở dropdown.
- Kết hợp:
  - Hide/show cột WorkType vẫn bình thường.
  - Không ảnh hưởng Priority/Phase dropdown.
- Chất lượng:
  - `npm run lint`
  - `npm run build`

## Rủi ro và giảm thiểu
- Rủi ro chồng dropdown (WorkType/Priority/Phase):
  - Giảm thiểu: mở cái này thì đóng 2 cái còn lại.
- Rủi ro click handler xung đột:
  - Giảm thiểu: dùng `onMouseDown + stopPropagation` cho item dropdown.

## Tiêu chí hoàn tất
1. Chỉnh `WorkType` được bằng dropdown list tại cột WorkType.
2. Chỉ chỉnh được ở row `group`.
3. Có `Clear`.
4. Không regress hide/show cột WorkType và các dropdown khác.
