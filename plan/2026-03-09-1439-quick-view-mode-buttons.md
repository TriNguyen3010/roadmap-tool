# Plan: Thêm nút Quick View Mode

## Mục tiêu
- Thêm nhóm nút lọc nhanh (quick view mode) để user chuyển view 1-click.
- Danh sách nút:
  - `Improvement`, `Bug`, `Feature`
  - `Web`, `App`
  - `Reported`
- Dùng lại logic filter hiện có để tránh tạo rule mới chồng chéo.

## Mapping với filter hiện tại
1. `Improvement`, `Bug`, `Feature` -> `filterGroupItemType`
2. `Web` -> `filterSubcategory` với tập giá trị `Web + Core`
3. `App` -> `filterSubcategory` với tập giá trị `App + Core`
4. `Reported` -> `filterPriority`

Ghi chú:
- Hệ thống hiện dùng giao nhau AND giữa các nhóm filter.
- Nút quick view sẽ chỉ là shortcut set/unset vào đúng mảng filter tương ứng.
- Rule multi-value:
  - Bật `Web`: thêm `Web` và `Core` vào `filterSubcategory`.
  - Bật `App`: thêm `App` và `Core` vào `filterSubcategory`.
  - Tắt `Web` hoặc `App`: chỉ gỡ tập giá trị do chính nút đó quản lý, tránh xóa nhầm value vẫn cần cho nút còn lại.

## Phạm vi
Bao gồm:
1. Thêm UI nút quick view trên toolbar (hoặc cạnh filter button).
2. Đồng bộ state bật/tắt nút với filter state hiện tại.
3. Dùng lại luồng save view hiện tại (không tạo schema mới).
4. Cập nhật nhãn/tooltip để user hiểu đây là filter nhanh.

Không bao gồm:
- Thêm backend endpoint mới.
- Đổi cách filter tree (AND/OR) ở vòng này.

## Kế hoạch triển khai
### Bước 1: Thiết kế API props cho Toolbar
- File: `src/components/Toolbar.tsx`
- Bổ sung props:
  - trạng thái active của quick view buttons
  - callback toggle theo key
- Render 1 cụm chip/button nhỏ:
  - Group 1: `Feature`, `Improvement`, `Bug`
  - Group 2: `Web`, `App`
  - Group 3: `Reported`

### Bước 2: Nối state ở page container
- File: `src/app/page.tsx`
- Tạo handler toggle cho từng quick key:
  - update `filterGroupItemType` / `filterSubcategory` / `filterPriority`
- Tạo `quickViewState` từ filter hiện có để truyền xuống Toolbar.
- Đảm bảo normalize:
  - `Reported` vẫn đi qua normalize priority filter hiện tại.
- Bổ sung helper cho subcategory map:
  - `Web` => `['Web', 'Core']`
  - `App` => `['App', 'Core']`
  - Dùng merge/remove theo set để tránh duplicate.

### Bước 3: Đồng bộ với FilterPopup
- File: `src/components/FilterPopup.tsx` (chỉ nếu cần)
- Không thêm source state mới.
- Khi user tick trong popup, quick button tự reflect active.
- Khi user bấm quick button, popup mở ra vẫn thấy checkbox tương ứng đã được chọn.

### Bước 4: UX guardrails
- Thêm tooltip ngắn:
  - “Quick filter, kết hợp theo AND với các filter khác”.
- Nếu filter value không tồn tại trong data hiện tại (vd `Web`/`App` chưa có), vẫn cho bật vì đây là filter hợp lệ, nhưng cần hiển thị trạng thái empty result rõ ràng như hiện tại.

### Bước 5: Test
1. Click từng nút quick -> grid lọc đúng.
2. Toggle lại -> bỏ filter đúng.
3. Kết hợp quick + filter popup -> state đồng bộ 2 chiều.
4. `Save View` rồi reload -> quick buttons giữ đúng active state.
5. Case chồng lấn `Core`:
  - Bật `Web` + `App` cùng lúc -> `Core` vẫn giữ.
  - Tắt `Web` khi `App` còn bật -> không xóa `Core` khỏi filter.
5. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro user hiểu nhầm quick view là OR:
  - Giảm thiểu: thêm tooltip/copy rõ “kết hợp AND”.
- Rủi ro trùng logic cập nhật filter gây lệch state:
  - Giảm thiểu: mọi thay đổi đi qua cùng các setter filter hiện có.
- Rủi ro UI toolbar bị chật:
  - Giảm thiểu: dùng chip nhỏ, cho wrap dòng trên màn hình hẹp.

## Tiêu chí hoàn tất
1. 6 nút quick view hiển thị và hoạt động ổn định.
2. Mỗi nút cập nhật đúng filter domain đã map.
3. State đồng bộ với FilterPopup và persisted qua Save View/reload.
4. Không có lỗi lint/build.
