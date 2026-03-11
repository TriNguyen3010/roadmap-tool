# Plan: Reskin toàn bộ Roadmap theo ref Coin98 + đổi tên file Pencil

## Mục tiêu
- Reskin toàn bộ web `Roadmap Tool` theo style của ref Coin98 (clean, sáng, vàng-trắng), không giới hạn ở một tính năng riêng lẻ.
- Chuẩn hóa visual system dùng chung cho mọi màn để UI đồng nhất.
- Tạo tên file `.pen` mới phản ánh phạm vi full roadmap.

## Phạm vi full roadmap
1. Roadmap Main (bảng chính: group/item, cột, tag, marker, toolbar trên cùng).
2. Filter Popup (2 cột, section phải, spacing compact).
3. Edit Popup (item/group edit fields, priority/workType/team/status/phase).
4. Reported Image Review (Main / Viewer / States).
5. Trạng thái hệ thống: empty, no-data, no-image, loading, error.

## Visual direction theo ref
1. Tone chủ đạo: vàng + trắng, accent vàng dùng tiết chế cho active/action.
2. Header mỏng, sạch, ít nhiễu; ưu tiên không gian nội dung chính.
3. Card/section bo góc vừa phải, border mảnh, shadow nhẹ.
4. Typography hierarchy rõ: heading đậm, metadata xám xanh.
5. Tabs/quick mode theo style underline active vàng.

## Design tokens áp dụng toàn cục
1. Color
- Primary: `#F0B90B`
- Primary Hover: `#DFA300`
- Background: `#FFFFFF`
- Section Background: `#FAFBFC`
- Border: `#E6EBF2`
- Text Primary: `#0B132B`
- Text Secondary: `#64748B`

2. Typography
- Font family: `Plus Jakarta Sans`
- Page/Screen title: `44px / 700`
- Section title: `32px / 600`
- Card/Panel title: `24px / 600`
- Body: `16px / 400`
- Meta label: `14px / 500`
- Chip/Caption: `12px / 500`

3. Spacing + shape
- Corner radius: `14-16`
- Button pill height thống nhất
- Khoảng cách dọc giữa section theo scale `8/12/16/24/32`

## Kế hoạch triển khai bằng Pencil
### Phase 1 - Foundation (Style System)
1. Tạo/chuẩn hóa style guide trong `.pen` cho color, text, button, card.
2. Định nghĩa component nền: header bar, tab row, card shell, chip/tag, dropdown trigger.
3. Soát alignment cơ bản để tránh lỗi text lệch tâm/overflow.

### Phase 2 - Roadmap Main (màn lõi)
1. Reskin toolbar trái/phải theo hệ mới.
2. Reskin bảng roadmap: cột, header row, badges/tag phase (P1/P2...), marker, dropdown inline.
3. Tối ưu readability khi hide/show cột (Phase, WorkType, ...).

### Phase 3 - Popups (Filter + Edit)
1. Filter Popup: compact spacing, 2 cột cân bằng, section phải rõ ràng.
2. Edit Popup: thống nhất label/field, bỏ phần progress theo yêu cầu trước đó.
3. Kiểm tra dropdown trạng thái/workType/phase đồng nhất interaction.

### Phase 4 - Reported Image Review
1. Main: tăng density card/category, ưu tiên ảnh dọc lớn.
2. Viewer: ảnh chính lớn, status/phase edit trực tiếp, panel info gọn.
3. States: empty/no-image/error/loading đồng bộ visual system.

### Phase 5 - QA visual + handoff
1. Chụp screenshot toàn bộ flow chính để review nhanh.
2. Soát overlap, clip, khoảng trắng thừa, contrast, typography.
3. Chốt khác biệt còn lại so với ref và danh sách tinh chỉnh cuối.

## Đổi tên file `.pen` (full roadmap)
- File hiện tại: `design/pencil-new.pen`
- Tên mới đề xuất: `design/roadmap-coin98-reskin-v1.pen`

### Quy tắc rename
1. Duplicate từ file hiện tại sang file mới trước khi chỉnh sâu.
2. Chỉnh trên file mới để giữ bản cũ làm backup.
3. Sau khi chốt, cập nhật toàn bộ plan/check references sang tên file mới.

## Acceptance criteria
1. Tất cả màn roadmap chính có cùng visual language (không bị lệch phong cách giữa các module).
2. Màn chính vẫn ưu tiên thao tác vận hành nhanh (filter, inline edit, marker, phase/workType).
3. Reported Image Review hòa chung style system nhưng vẫn ưu tiên ảnh.
4. Không còn lỗi text/button lệch tâm, tràn chữ, hoặc header-body overlap.
5. Có file `.pen` mới đúng tên cho phạm vi full roadmap.

## Ghi chú thay thế plan trước
- Plan này thay thế plan phạm vi hẹp `reported image review` ở file:
`plan/2026-03-11-1124-pencil-reskin-coin98-and-rename-file.md`
