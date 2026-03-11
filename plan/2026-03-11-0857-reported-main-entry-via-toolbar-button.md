# Update Plan: Entry vào `Reported Image Review - Main`

## Mục tiêu cập nhật
- Luồng vào `Reported Image Review - Main` phải rõ ràng: user bấm trực tiếp nút `Reported Image Review` trên toolbar.

## Cập nhật UX/IA
1. Đổi nhãn nút quick mode từ `Reported` -> `Reported Image Review`.
2. Nút này là entrypoint chính vào feature (không cần route riêng).
3. Khi nút active:
- áp filter `priority = Reported`
- bật layout/toolbar mode của màn Reported Image Review.
4. Khi tắt nút:
- thoát feature mode và quay về main view của project.

## Cập nhật kỹ thuật
1. `Toolbar`
- Cập nhật label quick button.
- Giữ cơ chế toggle như hiện tại.
2. `page.tsx`
- Duy trì `isReportedMode` làm nguồn sự thật cho UI mode.
- `onExitReportedMode` bỏ filter `Reported`.
3. Không đổi API/data schema.

## Acceptance
1. Bấm `Reported Image Review` => vào đúng màn feature.
2. Trạng thái active/inactive của nút phản ánh đúng mode.
3. Bấm lại (hoặc Back to Main) => quay lại main view.
4. Không ảnh hưởng quick buttons `Web`/`App`.

## Ghi chú triển khai
- Ưu tiên giữ toolbar gọn khi reported mode active.
- Nếu label dài gây chật toolbar, dùng text `Reported Review` làm fallback.
