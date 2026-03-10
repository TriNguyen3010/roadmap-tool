# Plan: Không hiển thị Status của Category và Subcategory

## Mục tiêu
- Ẩn hiển thị `Status` cho các dòng `category` và `subcategory`.
- Giữ nguyên dữ liệu status nội bộ để không làm vỡ logic tính toán/filter hiện tại.

## Phạm vi
Bao gồm:
1. Cột Status trên grid không show text status cho `category`, `subcategory`.
2. Không cho chỉnh status inline ở 2 loại này.
3. Giữ behavior status cho `group`, `item`, `team` như hiện tại.

Không bao gồm:
- Xóa dữ liệu status khỏi JSON/DB.
- Bỏ hoàn toàn filter status.

## Kế hoạch triển khai
### Bước 1: Cập nhật điều kiện render ở cột Status
- File: `src/components/SpreadsheetGrid.tsx`.
- Trong cell Status:
  - Nếu `row.type` là `category` hoặc `subcategory`:
    - hiển thị placeholder trống (`—` hoặc empty nhẹ màu xám).
  - Các type còn lại giữ status badge như cũ.

### Bước 2: Chặn chỉnh inline cho category/subcategory
- Tại logic `isStatusInlineEditable`:
  - Chỉ cho phép khi `row.type !== 'category' && row.type !== 'subcategory'`.
  - Vẫn tôn trọng rule `statusMode` auto/manual.

### Bước 3: Đảm bảo click behavior nhất quán
- Với category/subcategory:
  - click cột Status không mở dropdown.
  - nếu cần, cho mở EditPopup theo behavior hiện tại hoặc no-op (chốt 1 cách rõ ràng khi implement).

### Bước 4: Rà tác động phụ
- Kiểm tra các vị trí khác còn show status của category/subcategory (tooltip/info panel) và quyết định có cần ẩn đồng bộ không.
- Giữ filter/status pipeline không đổi để tránh regression lớn.

### Bước 5: Test
1. Category/subcategory không còn thấy status ở cột Status.
2. Group/item/team vẫn thấy và chỉnh status inline được.
3. Filter Status vẫn hoạt động bình thường.
4. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro user hiểu nhầm dữ liệu status bị mất:
  - chỉ ẩn UI, không xóa dữ liệu; có thể thêm tooltip “Status ẩn ở level này”.
- Rủi ro ảnh hưởng logic dropdown status:
  - giới hạn điều kiện rõ theo `row.type`.

## Tiêu chí hoàn tất
1. Không hiển thị status cho category/subcategory trên grid.
2. Không phát sinh lỗi ở inline status cho các level còn lại.
3. Lint/build pass.
