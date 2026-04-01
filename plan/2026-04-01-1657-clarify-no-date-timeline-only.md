# Plan: Làm rõ ý nghĩa `No date` trong Timeline Only

## Mục tiêu
- Làm cho user hiểu ngay badge `No date` trong mode `Timeline Only` đang biểu thị điều gì.
- Tránh cảm giác mơ hồ kiểu:
  - không biết là thiếu `start/end date`
  - không biết là task chưa được schedule
  - không biết là lỗi render hay lỗi dữ liệu
- Giữ timeline-only dễ scan nhưng wording phải rõ ràng hơn hiện tại.

## Vấn đề hiện tại
- Trong mode `Timeline Only`, khi một row không có bar timeline, hệ thống đang render badge `No date`.
- Wording `No date` quá chung và hơi “technical”.
- Với screenshot hiện tại, user có thể hiểu sai theo nhiều hướng:
  1. task không có bất kỳ thông tin ngày nào
  2. task bị lỗi dữ liệu
  3. timeline chưa load
  4. row này không thuộc timeline

## Ý nghĩa đúng của `No date`
- Ý nghĩa thực tế hiện tại là:
  - row đó chưa có `startDate` và/hoặc `endDate` hợp lệ để vẽ bar trên timeline
  - row vẫn được hiển thị để user biết task tồn tại trong tree
  - nhưng timeline chưa có dữ liệu ngày để đặt bar

## Phạm vi
Bao gồm:
1. Đổi wording badge để nghĩa rõ hơn.
2. Rà lại chỗ nào nên hiện badge, chỗ nào không nên hiện.
3. Cân nhắc tooltip ngắn để giải thích thêm.
4. Giữ layout timeline-only gọn, không làm rối mắt.

Không bao gồm:
- Thay đổi logic tính timeline date.
- Tự động suy luận date từ children trong vòng này.
- Redesign toàn bộ row label của timeline-only.

## Hướng UX đề xuất
### Option khuyến nghị
- Đổi `No date` thành `Chưa có lịch`.
- Nếu cần chính xác hơn nữa:
  - `Chưa có date`
  - `Chưa lên lịch`
  - `Chưa có start/end`

Khuyến nghị cuối:
- Dùng `Chưa có lịch`

Lý do:
- Ngắn, dễ hiểu với user non-technical.
- Gần với ngữ nghĩa timeline hơn `No date`.
- Không quá thiên về field kỹ thuật như `startDate/endDate`.

### Tooltip bổ sung
- Hover vào badge có thể hiện:
  - `Task này chưa có start/end date hợp lệ để vẽ trên timeline.`

### Rule hiển thị đề xuất
1. Row không có bar timeline thì mới hiện badge.
2. Nếu row có children nhưng chính row không có date:
  - cân nhắc vẫn hiện badge nếu thực sự row đó không có bar riêng
  - nhưng tooltip nên nói rõ đây là row chưa có lịch riêng
3. Nếu row đã có bar:
  - không hiện badge.

## Kế hoạch triển khai
### Bước 1: Chốt copy
- Thay `No date` bằng 1 wording rõ nghĩa hơn.
- Khuyến nghị:
  - badge text: `Chưa có lịch`
  - tooltip: `Task này chưa có start/end date hợp lệ để hiển thị trên timeline.`

### Bước 2: Cập nhật render trong Timeline Only
- File: `src/components/SpreadsheetGrid.tsx`
- Tại khu vực label sticky của timeline-only:
  - thay text badge hiện tại
  - thêm `title` hoặc tooltip rõ nghĩa

### Bước 3: Rà hierarchy của row cha/con
- Kiểm tra các row cha như category/subcategory/group:
  - nếu row đó không có lịch riêng nhưng có con có lịch, cần xem badge có gây hiểu nhầm không
- Nếu badge gây nhiễu:
  - chỉ show badge với row leaf
  - hoặc đổi tooltip cho row cha

### Bước 4: Test
1. Row không có `start/end date` hiện wording mới rõ ràng.
2. Row có bar không hiện badge.
3. User đọc screenshot timeline-only có thể hiểu ngay nghĩa của badge mà không cần hỏi lại.
4. Layout không bị dài/chật hơn đáng kể.

## Rủi ro và giảm thiểu
- Rủi ro wording dài quá làm label rối:
  - dùng copy ngắn ở badge, để giải thích dài hơn trong tooltip.
- Rủi ro `Chưa có lịch` bị hiểu là task chưa tồn tại:
  - tooltip phải nêu rõ là chưa có date để vẽ timeline.
- Rủi ro row cha có children nhưng vẫn hiện badge gây khó hiểu:
  - rà riêng row cha và chốt rule hiển thị phù hợp.

## Tiêu chí hoàn tất
1. Badge không còn dùng wording mơ hồ `No date`.
2. User nhìn vào timeline-only hiểu ngay đây là row chưa có date để hiển thị timeline.
3. Không làm rối layout hiện tại.
