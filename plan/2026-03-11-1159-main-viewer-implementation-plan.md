# Plan: Triển khai 2 trang Main và Viewer dựa trên file `.pen`

## Nguồn thiết kế dùng để bám
- File: `design/roadmap-coin98-reskin-v1.pen`
- Main frame: `bi8Au` (`Reported Image Review - Main`)
- Viewer frame: `EQZTl` (`Reported Image Review - Viewer`)

## Mục tiêu
- Hoàn thiện flow 2 trang cho `Reported Image Review`: vào Main -> mở Viewer -> chỉnh nhanh -> quay lại Main.
- UI runtime bám sát bố cục `.pen` và giữ độ rõ ràng khi dữ liệu lớn.

## Scope trang 1: Main (`bi8Au`)
1. Header (`OdxUz`)
- Back to Roadmap
- Title/subtitle
- Search box
- Action buttons (Reported / Edit Queue)

2. Body (`QvVRJ`)
- Sidebar category (`4elZl` / `xYS3h`) có scroll
- Content area (`ZVhCs`):
  - Tabs quick stats (`KHnS7`)
  - Grid ảnh (`scRdY`) theo cột/card

3. Quy tắc hiển thị
- Chỉ lấy item thuộc reported mode.
- Group theo category; item không ảnh vẫn hiển thị card “no image”.
- Ưu tiên ảnh dọc, nhưng giữ chiều cao card ổn định để scan.

## Scope trang 2: Viewer (`EQZTl`)
1. Layout chính (`lPMgI`)
- Cột trái (`XItSe`): ảnh chính + hàng thumbnail
- Cột phải (`VeCys`): metadata, status/phase trigger, note, nút hành động

2. Inline chỉnh dữ liệu
- Status block (`pfq20`) mở dropdown và update trực tiếp.
- Phase block (`u3Rys`) mở dropdown (single/multi theo rule hiện tại) và update trực tiếp.
- Save state: loading/success/error rõ ràng.

3. Điều hướng
- Từ Main mở Viewer theo item hiện tại.
- Đổi item trong thumbnail giữ nguyên panel phải.
- `Open Full Edit` quay về popup edit nhưng không mất ngữ cảnh item/index khi đóng lại.

## Data + State mapping
1. Dữ liệu đầu vào
- category, group, item, status, phase, priority, workType, team, images, notes.

2. State bắt buộc
- loading, empty, no image, error, no permission.
- filter changes làm refresh đúng Main và Viewer.

3. Đồng bộ state
- Edit ở Viewer phải phản ánh lại Main ngay.
- Main filter/phase/status ảnh hưởng tập item mở được ở Viewer.

## Kế hoạch triển khai theo đợt
### Đợt 1: Khung và điều hướng
1. Route/state cho 2 trang Main/Viewer.
2. Render skeleton bám frame `bi8Au` và `EQZTl`.
3. Wiring open/close Viewer từ Main.

### Đợt 2: Main hoàn chỉnh
1. Header actions + search.
2. Sidebar categories + quick stats tabs.
3. Grid cards (ảnh/no-image) + click vào Viewer.

### Đợt 3: Viewer hoàn chỉnh
1. Hero image + thumbnail strip.
2. Right panel metadata + notes.
3. Inline dropdown status/phase + feedback state.

### Đợt 4: Đồng bộ và QA
1. Đồng bộ data Main <-> Viewer.
2. Check edge cases (item không ảnh, phase rỗng, status rỗng).
3. QA layout với dataset lớn (nhiều category, nhiều ảnh).

## Acceptance criteria
1. Main hiển thị đúng danh sách reported theo category, có search/filter hoạt động.
2. Viewer mở đúng item được chọn và cho chỉnh status/phase trực tiếp.
3. Sau khi chỉnh ở Viewer, Main cập nhật ngay không cần refresh thủ công.
4. Không vỡ layout khi ảnh dọc/ngang hoặc khi không có ảnh.
5. Luồng qua lại Main/Viewer mượt, không mất ngữ cảnh đang review.

## Deliverables
1. Runtime 2 trang Main và Viewer theo `.pen`.
2. 01 checklist test flow chính + edge cases.
3. 01 bản screenshot đối chiếu mỗi trang (Main/Viewer).
