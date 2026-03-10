# Plan: Marker dạng hình tròn có số đếm tăng dần

## Mục tiêu
- Thay marker check hiện tại bằng marker hình tròn có số bên trong.
- Mỗi lần user mark group mới thì số tăng dần (`1, 2, 3...`).
- Vẫn là state tạm, không lưu DB/JSON.

## Quy ước hiển thị đề xuất
1. Group được mark sẽ hiện badge tròn chứa số thứ tự.
2. Số thể hiện thứ tự user đã mark để rà soát.
3. Group chưa mark: không hiển thị gì (giữ diện tích gọn như yêu cầu trước).

## Hành vi tương tác
1. Click vào vùng marker của group chưa mark:
- gán số tiếp theo (max hiện có + 1).
2. Click vào group đã mark:
- bỏ mark.
3. Sau khi bỏ mark:
- re-index lại danh sách marker để số luôn liên tục `1..N`.

## Phạm vi
Bao gồm:
1. Đổi state marker từ `Set<string>` sang cấu trúc có thứ tự số.
2. Render badge số trong hình tròn ở vị trí marker hiện tại.
3. Giữ `stopPropagation` để click marker không mở Edit popup.

Không bao gồm:
- Persist thứ tự marker theo user.
- Đồng bộ marker giữa nhiều phiên/máy.

## Kế hoạch triển khai
### Bước 1: Đổi data structure marker
- File: `src/components/SpreadsheetGrid.tsx`.
- Thay `reviewedGroupIds: Set<string>` bằng mapping/index, ví dụ:
  - `reviewedGroupOrder: string[]` (mảng id theo thứ tự mark)
  - helper lấy số hiển thị: `index + 1`.

### Bước 2: Cập nhật toggle logic
1. Nếu id chưa có trong `reviewedGroupOrder`:
- push vào cuối.
2. Nếu id đã có:
- remove khỏi mảng.
3. Do dùng mảng thứ tự, số hiển thị tự re-index liên tục.

### Bước 3: Render marker số
- Ở slot marker trước text group:
  - nếu group đã mark -> render hình tròn + số.
  - chưa mark -> không render icon (chỉ vùng click).
- Cân chỉnh kích thước badge để số 2 chữ số vẫn đọc được.

### Bước 4: UX chi tiết
- Tooltip:
  - unmarked: `Đánh dấu rà soát`
  - marked: `Bỏ đánh dấu rà soát (#N)`
- Giữ màu tương phản tốt khi số >= 10.

### Bước 5: Test
1. Mark 3 group liên tiếp -> hiển thị `1,2,3`.
2. Unmark group số 2 -> các group sau reindex đúng.
3. Mark lại group đó -> nhận số mới ở cuối danh sách.
4. Click marker không mở popup edit.
5. Reload trang -> marker reset.
6. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro user kỳ vọng số không đổi sau unmark:
  - quy ước rõ là số thứ tự rà soát hiện tại (dynamic).
- Rủi ro badge số 2 chữ số bị chật:
  - tăng min-width + font size hợp lý.
- Rủi ro logic toggle sai do mutate mảng:
  - luôn clone state immutable.

## Tiêu chí hoàn tất
1. Marker hiển thị dạng tròn có số tăng dần.
2. Toggle mark/unmark hoạt động đúng và reindex chuẩn.
3. Không ảnh hưởng luồng save/filter/edit hiện tại.
4. Lint/build pass.
