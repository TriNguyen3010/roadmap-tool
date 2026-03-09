# Plan: Đồng nhất WorkType + thêm QC + ẩn tiến độ trong Edit Popup

## Mục tiêu
- Đồng nhất naming `WorkType` trên UI (không lẫn `Item type`).
- Bổ sung team `QC` vào hệ thống chọn team.
- Ẩn phần chỉnh `Tiến độ` trong popup Edit để giao diện gọn hơn.

## Quyết định thiết kế
- Thuật ngữ chuẩn trên UI: `WorkType`.
- `QC` là một `TeamRole` chính thức như BA/Growth/PD/BE/FE.
- Progress vẫn giữ trong data model và logic tính toán; chỉ ẩn phần chỉnh tay trong popup Edit.

## Phạm vi
Bao gồm:
1. Rename label UI liên quan `Item type` -> `WorkType`.
2. Update enum/team options thêm `QC`.
3. Ẩn block Progress trong `EditPopup`.

Không bao gồm:
- Xóa field `progress` khỏi data model.
- Đổi logic recalculate progress/status trong helper.

## Kế hoạch triển khai

### Bước 1: Đồng nhất nhãn WorkType
- `src/components/EditPopup.tsx`
  - Đổi label `Item type` thành `WorkType`.
- `src/components/FilterPopup.tsx` (nếu cần)
  - Đổi `Item type (Group)` thành `WorkType (Group)` để thống nhất.
- `src/components/SpreadsheetGrid.tsx`
  - Giữ header cột `WORKTYPE` như hiện tại.

### Bước 2: Thêm team QC
- `src/types/roadmap.ts`
  - Cập nhật:
    - `type TeamRole = 'BA' | 'Growth' | 'PD' | 'BE' | 'FE' | 'QC'`
    - `TEAM_ROLES` thêm `QC`.
- Các popup dùng `TEAM_ROLES` sẽ tự nhận:
  - `src/components/AddNodePopup.tsx`
  - `src/components/EditPopup.tsx`
- Kiểm tra filter team (`availableTeams`) vẫn hoạt động đúng với `QC`.

### Bước 3: Ẩn phần Progress trong popup Edit
- `src/components/EditPopup.tsx`
  - Ẩn/loại bỏ block UI `Progress` (label + slider).
  - Giữ logic save và recalculate hiện tại để không ảnh hưởng dữ liệu.

### Bước 4: Regression test
- WorkType:
  - UI chỉ còn dùng từ `WorkType`.
  - Dropdown WorkType ở cột/grid + popup vẫn hoạt động.
- Team:
  - Có thể chọn `QC` khi tạo/sửa item/group.
  - `QC` xuất hiện trong filter team khi có dữ liệu.
- Progress:
  - Popup không còn phần chỉnh tiến độ.
  - Build/runtime không lỗi; roadmap vẫn tính toán progress như trước.
- Chất lượng:
  - `npm run lint`
  - `npm run build`

## Rủi ro và giảm thiểu
- Rủi ro mismatch label giữa các màn hình:
  - Giảm thiểu: grep toàn bộ chuỗi `Item type` trước khi chốt.
- Rủi ro dữ liệu cũ có team value ngoài enum:
  - Giảm thiểu: chỉ mở rộng enum (không thu hẹp), không phá dữ liệu cũ.
- Rủi ro mất khả năng chỉnh tiến độ thủ công:
  - Giảm thiểu: chấp nhận theo yêu cầu; vẫn giữ progress trong model để hiển thị/tính toán.

## Tiêu chí hoàn tất
1. UI thống nhất dùng `WorkType`.
2. Team list có `QC`.
3. Popup Edit không hiển thị phần `Tiến độ`.
4. Lint/build pass.
