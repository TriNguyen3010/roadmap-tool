# Plan: Pencil Reskin theo Ref + Đổi tên file

## Mục tiêu
- Reskin toàn bộ màn hình của tính năng `Reported Image Review` theo visual style của 2 ảnh ref Coin98.
- Sau khi hoàn tất reskin, đổi sang tên file `.pen` mới để tách khỏi bản cũ và dễ bàn giao.

## Phạm vi reskin
1. `Reported Image Review - Main`
2. `Reported Image Review - Viewer`
3. `Reported Image Review - States`
4. Style token dùng chung (màu, typography, spacing, button, card)

## Định hướng style theo ref
1. Tone chính: vàng - trắng, nền sáng, card trắng bo góc nhẹ.
2. Header mỏng và gọn, bố cục sạch, khoảng trắng có chủ đích.
3. Tab underline vàng ở trạng thái active.
4. Card/grid rõ hierarchy: title đậm, metadata xám xanh, CTA pill.
5. Ưu tiên hiển thị ảnh dọc lớn nhất có thể, giảm vùng trống không cần thiết.

## Design token áp dụng
1. Màu
- Primary: `#F0B90B`
- Primary hover: `#DFA300`
- Background: `#FFFFFF`
- Section bg: `#FAFBFC`
- Border: `#E6EBF2`
- Text primary: `#0B132B`
- Text secondary: `#64748B`

2. Typography
- Font: `Plus Jakarta Sans`
- Screen title: `44px / 700`
- Section title: `32px / 600`
- Card title: `24px / 600`
- Body: `16px / 400`
- Meta/label: `14px / 500`
- Caption/chip: `12px / 500`

## Kế hoạch triển khai
### Phase 1 - Chuẩn hóa khung UI
1. Chuẩn hóa style guide và token trong file Pencil hiện tại.
2. Cập nhật header + tab + layout khung chính theo ref.
3. Kiểm tra tránh overlap giữa header và body.

### Phase 2 - Reskin Main (ưu tiên density)
1. Tăng diện tích hữu dụng cho grid để show nhiều category/card hơn.
2. Scale card ảnh theo ưu tiên ảnh dọc (portrait-first).
3. Giữ thông tin cần review: status, phase, quick note, edit trigger.

### Phase 3 - Reskin Viewer + States
1. Viewer: ảnh chính lớn, panel info gọn, status/phase dropdown rõ.
2. States: empty/no image/error/loading đồng nhất visual.
3. Sửa alignment text/button, không overflow text.

### Phase 4 - QA visual + handoff
1. Chụp screenshot từng màn để đối chiếu với ref.
2. Soát spacing, typography, color contrast, alignment.
3. Chốt danh sách điểm khác biệt còn lại (nếu có).

## Đổi tên file `.pen`
- File hiện tại: `design/pencil-new.pen`
- Tên mới đề xuất: `design/reported-image-review-coin98-reskin-v1.pen`

### Quy tắc rename
1. Chỉ rename sau khi chốt reskin để tránh nhầm bản đang chỉnh.
2. Nếu cần giữ lịch sử, để lại file cũ làm backup và tạo bản mới bằng copy.
3. Cập nhật mọi ghi chú/plan sau đó để trỏ sang tên file mới.

## Acceptance criteria
1. Visual tổng thể bám đúng style ref (clean, sáng, vàng-trắng, card-based).
2. Main và Viewer ưu tiên hiển thị ảnh dọc, giảm khoảng trống dư.
3. Status và Phase bấm được để mở dropdown ở Viewer.
4. Không còn lỗi text lệch tâm, text tràn, hoặc header/body overlap.
5. Có file `.pen` mới với tên rõ nghĩa để bàn giao.
