# Plan: Bước tiếp theo cho Pencil - Reported Image Review polish

## Mục tiêu
- Nâng chất lượng bản thiết kế hiện tại từ compact draft lên mức dễ đọc hơn.
- Giữ số lượng ảnh hiển thị cao, đồng thời cải thiện nhận diện thông tin chính.
- Đồng bộ visual giữa `Main` và `Viewer` để sẵn sàng handoff cho UI implementation.

## Phạm vi
Bao gồm:
1. Cải thiện readability ở card compact (font/contrast/hierarchy).
2. Thêm badge rõ ràng cho `Reported` và `image count`.
3. Đồng bộ style card + metadata ở `Viewer`.
4. Rà lại spacing/alignment và empty states.

Không bao gồm:
- Code React/Next.
- Thay đổi dữ liệu hoặc logic filter.

## Bước triển khai trên Pencil
1. **Main screen polish (`bi8Au`)**
   - Tăng nhẹ font của title/meta card (ví dụ 13->14 ở title, 11->12 ở meta).
   - Giảm bớt chữ dài, ưu tiên text ngắn + badge.
   - Chuẩn hóa card spacing: padding/gap nhất quán toàn grid.

2. **Badge system**
   - Thêm badge `Reported` (màu xanh) tách khỏi dòng meta.
   - Thêm badge `N imgs` tách riêng để scan nhanh số ảnh.
   - Đảm bảo badge hiển thị cả ở card có ảnh và không ảnh.

3. **Viewer sync (`EQZTl`)**
   - Đồng bộ typography và màu metadata theo main.
   - Làm rõ hierarchy: title > meta > quick note > actions.
   - Tối ưu vị trí CTA `Edit Item` và `Next Report` theo action hierarchy.

4. **States screen cleanup (`G4EAC`)**
   - Đồng bộ ngôn ngữ badge/text với Main.
   - Giảm placeholder dư, tăng tính mô phỏng trạng thái thực tế.

5. **QA bằng screenshot + layout check**
   - Chụp lại 3 màn sau polish.
   - Chạy `snapshot_layout(problemsOnly=true)` để đảm bảo không clipping/misalignment.

## Tiêu chí hoàn tất
1. Main vẫn hiển thị >= 8 card cùng viewport nhưng dễ đọc hơn.
2. Badge `Reported` và `image count` rõ ràng, không phụ thuộc dòng text dài.
3. Viewer đồng bộ visual language với Main.
4. Không có layout problems trong canvas.

## Rủi ro và giảm thiểu
1. Tăng readability làm giảm mật độ:
   - Chỉ tăng nhẹ font/spacing và kiểm tra lại số card hiển thị.
2. Thêm badge gây rối card nhỏ:
   - Dùng badge compact (height thấp, text ngắn).
3. Không đồng bộ giữa 3 màn:
   - Dùng cùng token màu/chữ cho title/meta/badge trên tất cả frame.
