# Plan: Xác định item Reported thiếu ảnh + hiển thị danh sách review

## Mục tiêu
- Có cách xem ngay item nào đang `Priority = Reported` nhưng chưa có ảnh.
- Hỗ trợ review nhanh trước khi vào viewer/edit từng item.

## Kết quả rà soát hiện tại (từ dữ liệu roadmap hiện có)
- Tổng item Reported thiếu ảnh: **1**
- Item:
  - `022a1f08` | `Remove old Referral scheme`
  - Type: `group`
  - Category/Subcategory: `OneID / Web`
  - Status: `Not Started`

## Cách xác định item thiếu ảnh (rule chuẩn)
1. Lấy các row có `priority = Reported` trong scope filter hiện tại.
2. Chuẩn hóa danh sách ảnh theo cùng rule với UI (`images[]` + fallback legacy `imageId/imageUrl`).
3. Item có `imageCount = 0` => thiếu ảnh.

## Đề xuất triển khai UI
### Phase 1 - Review list ngay trong Reported mode
1. Thêm nút/section `Missing images` trong panel trái.
2. Hiển thị danh sách item thiếu ảnh (ID + tên + category/subcategory + status).
3. Click 1 dòng -> mở Edit item để thêm ảnh ngay.

### Phase 2 - Tăng hiệu quả review
1. Thêm sort theo category hoặc status.
2. Thêm copy/export list thiếu ảnh (text) để gửi team.

### Phase 3 - Validation
1. Khi thêm ảnh cho item thiếu ảnh, danh sách cập nhật realtime và giảm count.
2. Không ảnh hưởng luồng viewer hiện tại.

## Acceptance criteria
1. User nhìn thấy ngay danh sách item Reported thiếu ảnh trong scope hiện tại.
2. Có thể mở nhanh item đó để bổ sung ảnh.
3. Counter thiếu ảnh khớp với dữ liệu thật.
