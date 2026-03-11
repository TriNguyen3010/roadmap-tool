# Update Plan: Reported Image Review (bản cập nhật tổng)

## Mục tiêu
- Chốt lại plan đúng theo hiện trạng mới nhất của Pencil và code runtime.
- Triển khai `Reported Image Review` thành flow rõ ràng: vào mode -> review ảnh -> chỉnh nhanh -> mở full edit -> quay về main.

## Hiện trạng xác nhận
1. Pencil hiện có 3 màn chính trong `design/pencil-new.pen`:
- `Reported Image Review - Main` (`bi8Au`)
- `Reported Image Review - Viewer` (`EQZTl`)
- `Reported Image Review - States` (`G4EAC`)
2. Runtime hiện đã có:
- Quick mode `reported` trên toolbar (đang là label `Reported`).
- Viewer ảnh trong `SpreadsheetGrid` với chỉnh inline `Status` và `Phase`.
3. Lệch hiện tại:
- Chưa có “feature mode” tách rõ như màn Main/Viewer trong Pencil.
- Còn lỗi layout clip trong file Pencil cần chốt trước khi handoff.

## Phạm vi triển khai
1. Entry và điều hướng của feature `Reported Image Review`.
2. Màn Main ưu tiên hiển thị ảnh dọc và theo Category.
3. Màn Viewer chỉnh nhanh `Status`/`Phase` trực tiếp.
4. Trạng thái rỗng/lỗi/thiếu ảnh theo màn `States`.
5. Luồng mở `Full Edit` và quay lại viewer không mất ngữ cảnh.

## Phase 1 - Align Design Baseline (Pencil)
### Việc làm
1. Fix toàn bộ lỗi clip/wrap trong 3 màn hiện có.
2. Chuẩn hóa text style theo tone vàng-trắng và hierarchy font đã chốt.
3. Chốt interaction state cho trigger `Status`/`Phase` (default/open/selected).

### Acceptance
1. `snapshot_layout(...problemsOnly=true)` không còn cảnh báo clip.
2. Main/Viewer/States hiển thị ổn định, không overlap.

## Phase 2 - Entry Mode và Main Screen Runtime
### Việc làm
1. Toolbar:
- đổi label quick mode `Reported` -> `Reported Image Review`.
- click vào nút này mở đúng mode review (không chỉ đơn thuần toggle filter).
2. Page state:
- dùng cờ mode rõ ràng cho feature (`isReportedMode` hoặc tương đương).
- hỗ trợ `Back to Main Project`.
3. Main screen:
- render theo Category (cột trái) + grid ảnh dọc tối ưu diện tích.
- ưu tiên card ảnh portrait lớn nhất có thể trong viewport.

### Acceptance
1. Bấm `Reported Image Review` vào đúng mode.
2. Bấm back quay về main view của project.
3. Main mode vẫn bám filter hiện hành (category/subcategory/phase/status/team).

## Phase 3 - Viewer-first Workflow
### Việc làm
1. Viewer panel phải cho chỉnh inline:
- `Status` dropdown
- `Phase` dropdown (multi-select)
2. Save inline phản hồi rõ: saving/success/error.
3. Nút `Open Full Edit` mở popup edit đúng item đang xem.
4. Sau khi save từ Full Edit, quay lại Viewer vẫn giữ item/index hiện tại.

### Acceptance
1. Chỉnh `Status`/`Phase` trong Viewer cập nhật ngay lên grid.
2. Không mất ngữ cảnh khi chuyển qua lại Viewer <-> Full Edit.

## Phase 4 - States + Data Rules
### Việc làm
1. Implement đầy đủ state:
- Empty category
- No reported data
- Reported but no image
- Loading / Error / Permission
2. Rule data:
- chỉ lấy item có `priority = Reported` cho feature mode.
- item không ảnh vẫn xuất hiện trong state tương ứng.
3. Đồng bộ logic khi đổi filter làm item vào/ra current view.

### Acceptance
1. Mọi state đều có UI rõ ràng và thông điệp đúng ngữ cảnh.
2. Không lọt item sai điều kiện reported.

## Phase 5 - QA, Export, Release
### Việc làm
1. Test trọng điểm:
- vào/thoát mode review
- lọc category/phase/status
- inline edit status/phase
- full edit roundtrip
2. Export:
- giữ 2 mode `Export Current View` và `Export Full Data`.
- `Current View` phải theo đúng rows + cột show/hide hiện tại.
3. Soát hiệu năng với dataset nhiều category và nhiều ảnh/item.

### Acceptance
1. Không có blocker trong flow review ảnh reported.
2. Export đúng mode người dùng chọn.

## Mapping kỹ thuật đề xuất
1. `src/components/Toolbar.tsx`:
- label + hành vi nút quick mode reported.
2. `src/app/page.tsx`:
- state feature mode, entry/exit, wiring filter + view.
3. `src/components/SpreadsheetGrid.tsx`:
- Main grid ảnh reported, Viewer, inline status/phase, state rendering.

## Rủi ro
1. Scope runtime đổi nhanh hơn bản vẽ gây lệch lại.
2. Dữ liệu phase/status cập nhật đồng thời có thể gây race nếu save không tuần tự.
3. Dataset ảnh lớn có thể làm chậm render nếu chưa virtualize/tối ưu.

## Ưu tiên thực thi
1. Làm ngay: Phase 1 + Phase 2.
2. Tiếp theo: Phase 3.
3. Cuối cùng: Phase 4 + Phase 5.
