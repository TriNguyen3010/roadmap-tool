# Inline Calendar In Date Mini Popup Plan

## Mục tiêu

Khi user click vào `Start Date` hoặc `End Date` trong grid:

- popup mở ra
- thấy **calendar ngay bên trong popup**
- có thể click chọn ngày ngay, không phải bấm thêm vào icon lịch hoặc chờ native picker

Mục tiêu UX là làm inline date editing thực sự nhanh khi user chỉnh nhiều date liên tiếp.

## Vấn đề hiện tại

Ở [DateMiniPopup.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/DateMiniPopup.tsx), popup hiện đang dùng:

- `input type="date"`
- `autoFocus`

Nhưng cách này có 2 hạn chế:

1. browser chỉ hiện field, chưa chắc bung calendar ngay
2. `showPicker()` nếu dùng cũng không ổn định giữa các browser và user gesture context

Vì vậy UX hiện tại vẫn còn thêm một bước click.

## Kết luận kỹ thuật

Không nên tiếp tục phụ thuộc vào native date picker nếu mục tiêu là:

- mở popup là thấy lịch ngay
- hành vi ổn định giữa browser
- giảm tối đa số click

Hướng chắc chắn hơn là:

- render **inline calendar** ngay trong `DateMiniPopup`
- vẫn giữ input text/date ở phần trên để user thấy ngày đang chọn rõ ràng
- click ngày trong calendar sẽ update `dateValue` ngay

## Scope

### Trong scope

- thêm mini calendar inline vào `DateMiniPopup`
- có nút chuyển tháng trước/sau
- highlight ngày đang chọn
- highlight hôm nay
- click ngày để chọn nhanh
- vẫn giữ `Xoá ngày`, `OK`, `ESC`, click outside

### Ngoài scope

- không thay toàn bộ date editing flow ở nơi khác
- không thêm calendar library mới nếu chưa thật sự cần
- không đổi logic save date ở grid

## Tận dụng code hiện có

Project đã có `date-fns`, nên có thể tự dựng calendar nhỏ mà không cần thêm dependency mới.

Các util có thể dùng:

- `startOfMonth`
- `endOfMonth`
- `startOfWeek`
- `endOfWeek`
- `addDays`
- `addMonths`
- `subMonths`
- `isSameDay`
- `isSameMonth`
- `format`
- `parseISO`

## Quyết định UI

Popup mới sẽ gồm:

1. label `Start Date` / `End Date`
2. field hiển thị ngày đang chọn
3. calendar month inline
4. warning text nếu vượt `comparisonValue`
5. footer với `Xoá ngày` và `OK`

### Hành vi chọn ngày

- click ngày -> update state ngay
- chưa auto-save ngay
- user vẫn bấm `OK` để confirm, giữ consistency với flow hiện tại

### Hành vi tháng

- header có:
  - tháng/năm hiện tại
  - nút `prev`
  - nút `next`
- nếu popup mở với date đã có:
  - calendar mở đúng tháng của date đó
- nếu chưa có date:
  - mở ở tháng hiện tại

## Phase 1 - Dựng inline calendar cơ bản

### Việc cần làm

- mở rộng [DateMiniPopup.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/DateMiniPopup.tsx)
- thêm state `visibleMonth`
- render grid 7 cột cho các ngày
- render đầy đủ ngày đầu/cuối tháng theo tuần
- click ngày để set `dateValue`

### Yêu cầu

- ngày đang chọn phải nhìn rõ
- ngày thuộc tháng ngoài nên mờ hơn
- hôm nay có style riêng nhẹ

### Done when

- mở popup là thấy lịch ngay
- click ngày đổi được `dateValue`

## Phase 2 - Fit layout và interaction

### Việc cần làm

- tăng kích thước popup hợp lý để calendar không bị chật
- giữ vị trí popup không tràn viewport
- giữ click outside / `ESC` / `OK` / `Xoá ngày`
- nếu chọn ngày làm warning với mốc còn lại thì vẫn hiện warning như cũ

### Done when

- popup mới vẫn gọn
- không che quá nhiều grid
- không bị vỡ khi mở gần mép màn hình

## Phase 3 - Polish UX

### Việc cần làm

- month navigation mượt
- chọn ngày xong vẫn focus hợp lý
- nếu user đang chỉnh liên tiếp nhiều dòng, popup phản hồi nhanh
- cân nhắc click double:
  - click 1 lần chọn ngày
  - vẫn cần `OK`

### Quyết định hiện tại

Giữ `OK` thay vì auto-save ngay khi click ngày, để không thay đổi behavior save quá mạnh trong phase này.

## Phase 4 - Verify regression

### Case cần test

1. mở `Start Date` -> thấy lịch ngay
2. mở `End Date` -> thấy lịch ngay
3. chọn ngày khác tháng hiện tại
4. chuyển tháng rồi chọn ngày
5. `Xoá ngày` vẫn hoạt động
6. `OK` vẫn lưu đúng
7. `ESC` vẫn đóng popup
8. click ngoài vẫn đóng
9. warning `greater_than` / `less_than` vẫn đúng

## File dự kiến chạm

- [DateMiniPopup.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/DateMiniPopup.tsx)
- có thể thêm test nếu cần cho helper calendar

## Rủi ro kỹ thuật

### 1. Popup cao hơn hiện tại

Calendar inline sẽ làm popup lớn hơn.

Giải pháp:

- tăng `POPUP_HEIGHT`
- mở lên trên nếu thiếu chỗ phía dưới
- nếu cần, cho phần calendar compact hơn thay vì full-size desktop date picker

### 2. Tự dựng calendar có logic ngày dễ sai

Giải pháp:

- dùng hoàn toàn `date-fns`
- test các case:
  - đầu tháng
  - cuối tháng
  - tháng 28/29/30/31 ngày

### 3. Click ngày nhưng user quên bấm OK

Giải pháp:

- giữ selected state hiển thị rất rõ
- chưa auto-close trong phase đầu để tránh save nhầm

## Kết quả kỳ vọng

Sau khi hoàn tất:

- popup mở là thấy lịch ngay
- user chỉ cần:
  - click ô date
  - click ngày trên calendar
  - bấm `OK`

Flow này sẽ nhanh hơn và chắc chắn hơn đáng kể so với việc phụ thuộc native picker.
