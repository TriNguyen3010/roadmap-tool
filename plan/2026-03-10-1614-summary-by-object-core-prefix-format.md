# Plan: Update Summary by Object (thêm Core + gộp Group vào tiền tố)

## Mục tiêu
- Bổ sung phần `Core` vào report `Summary by Object`.
- `Core` hiển thị ngay dưới `App (Mobile)`.
- STT phần `Core` **đếm tiếp** từ STT của `App` (không reset).
- Bỏ cột `Group` riêng, thay bằng prefix ngay trong nội dung để report gọn hơn.

## Yêu cầu thay đổi
1. Bố cục block
- Thứ tự block trong summary:
  1. `App (Mobile)`
  2. `Core` (ngay dưới App)
  3. `Web`
  4. `Team PD (Product Design)`

2. Quy tắc STT
- `App` bắt đầu từ `1`.
- `Core` tiếp tục STT ngay sau dòng cuối của `App`.
- `Web` và `Team PD` vẫn reset từ `1` như hiện tại (trừ khi có yêu cầu mới).

3. Format dòng nội dung
- Bỏ cột `Group` riêng.
- Dùng cột nội dung dạng prefix:
  - `{Group}: {Tên tính năng}`
- Ví dụ:
  - `1 | OneID: Gỡ bỏ cơ chế Referral cũ`
  - `2 | OneID: Giao diện Banner động`

## Thiết kế output mới
- Sheet: `Summary by Object`
- Header mỗi block:
  - `ID | Nội dung`
- Dòng data:
  - Cột `ID`: STT
  - Cột `Nội dung`: `groupName + ': ' + featureName`

## Phạm vi
Bao gồm:
1. Cập nhật builder summary để có block `core`.
2. Cập nhật quy tắc đánh số liền mạch giữa `app` và `core`.
3. Refactor schema summary từ 3 cột -> 2 cột.
4. Cập nhật width cột summary cho format mới.

Không bao gồm:
- Thay đổi logic phân loại `Web`/`Team PD` hiện có.
- Thay đổi format sheet `Roadmap` và `Milestones`.

## Kế hoạch triển khai
### Bước 1: Cập nhật model summary
- Đổi cấu trúc dòng summary:
  - `index`
  - `content` (đã chứa prefix group)

### Bước 2: Thêm block `Core`
- Trong logic phân loại, thêm bucket `core` (subcategory = `Core`).
- Giữ thứ tự render: `App` -> `Core` -> `Web` -> `Team PD`.

### Bước 3: Điều chỉnh numbering
- Khi render `Core`, nhận `startIndex = app.length + 1`.
- `Web` và `Team PD` vẫn start từ `1`.

### Bước 4: Cập nhật layout sheet summary
- Header đổi thành `ID | Nội dung`.
- Cột nội dung nối prefix group.
- Điều chỉnh `!cols` cho 2 cột (ID nhỏ, nội dung rộng).

### Bước 5: Verify
1. Có data App/Core -> Core nằm ngay dưới App và STT nối tiếp.
2. Không còn cột `Group` riêng.
3. Nội dung hiển thị đúng format `Group: Feature`.
4. Web/Team PD vẫn đúng mapping hiện có.
5. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro hiểu sai “đếm tiếp phần App”:
  - Chốt rõ chỉ nối STT giữa `App` và `Core`.
- Rủi ro chuỗi nội dung quá dài sau khi gộp prefix:
  - Mở rộng width cột nội dung trong summary sheet.
- Rủi ro mất ngữ nghĩa khi bỏ cột Group:
  - Ép prefix bắt buộc theo format `Group: Feature`.

## Tiêu chí hoàn tất
1. Summary có block `Core` ngay dưới `App`.
2. STT `Core` nối tiếp `App`.
3. Report gọn còn 2 cột `ID | Nội dung`.
4. Nội dung giữ đủ context nhờ prefix `Group`.
