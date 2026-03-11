# Plan: Tối ưu layout Filter + ẩn 3 nút Feature/Improvement/Bug

## Mục tiêu
- Giảm khoảng trống trong popup Filter bằng cách tách layout thành 2 phần trái/phải.
- Thêm 1 section bên phải để chứa các filter chi tiết, tránh dồn toàn bộ nội dung thành 1 cột dài.
- Ẩn 3 nút quick view `Feature`, `Improvement`, `Bug` trên toolbar.
- Layout lại khu vực quick buttons để gọn, cân đối hơn.

## Phạm vi
Bao gồm:
1. UI popup Filter (chia cột trái/phải).
2. UI toolbar quick buttons (ẩn 3 nút và căn lại layout).
3. Đồng bộ logic filter hiện có sau khi ẩn quick buttons.

Không bao gồm:
- Thay đổi semantics filter dữ liệu (AND logic hiện tại vẫn giữ nguyên).
- Thay đổi schema JSON/settings.

## Thiết kế đề xuất
### 1) Popup Filter: 2 section trái/phải
- Tăng độ rộng panel từ `w-[440px]` lên `w-[760px]` (desktop).
- Body đổi sang grid 2 cột:
  - Cột trái: `Scope` (Category + Subcategory) giữ dạng list dài.
  - Cột phải: `WorkType (Group)`, `Phase`, `Status`, `Priority`, `Teams`.
- Các block ở cột phải dùng card nền nhẹ + khoảng cách đều để tận dụng không gian.
- Responsive:
  - Màn hình nhỏ (ví dụ `< lg`) tự động quay về 1 cột để không vỡ UI.

### 2) Toolbar quick view
- Bỏ khỏi dàn nút: `Feature`, `Improvement`, `Bug`.
- Giữ lại: `Web`, `App`, `Reported`.
- Căn lại container quick buttons (padding/gap/scroll) để vùng bên trái không bị trống.
- Filter theo WorkType vẫn thao tác trong popup Filter (không mất tính năng).

### 3) Đồng bộ logic toggle mode
- Thu gọn `QuickViewMode` chỉ còn `web | app | reported`.
- Cập nhật handler toggle ở `page.tsx` để bỏ nhánh xử lý `feature/improvement/bug`.
- Không đụng đến state `filterGroupItemType` ngoài việc ngừng toggle từ toolbar.

## Kế hoạch triển khai
1. Refactor `FilterPopup` sang layout 2 cột và tách section phải.
2. Update `Toolbar` để remove 3 nút quick view và cân chỉnh lại layout vùng trái.
3. Update kiểu `QuickViewMode` + handler ở `page.tsx`.
4. Verify interaction và responsive trên desktop/mobile.
5. Chạy `npm run lint` + `npm run build`.

## File dự kiến thay đổi
- `src/components/FilterPopup.tsx`
- `src/components/Toolbar.tsx`
- `src/app/page.tsx`

## Rủi ro và giảm thiểu
- Rủi ro panel rộng quá trên màn hình nhỏ:
  - Dùng responsive fallback 1 cột, giới hạn max width theo viewport.
- Rủi ro user mất thao tác nhanh theo WorkType:
  - Giữ nguyên filter WorkType trong popup, đặt ở cột phải dễ thấy.
- Rủi ro regression quick filter:
  - Test lại 3 mode còn lại (`Web/App/Reported`) và count filter badge.

## Tiêu chí hoàn tất
1. Popup Filter có section bên phải rõ ràng, không còn cảm giác dư khoảng trống.
2. Toolbar không còn 3 nút `Feature/Improvement/Bug`.
3. Khu vực quick buttons đã layout lại gọn và cân đối.
4. Các filter còn lại hoạt động đúng như trước.
5. `lint` và `build` pass.
