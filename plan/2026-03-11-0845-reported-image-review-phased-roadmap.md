# Plan: Reported Image Review - phân tích hiện trạng và roadmap theo phase

## 1) Phân tích hiện trạng

### Đã có trong code
1. Có quick mode `reported` trong toolbar để lọc nhanh theo priority Reported.
2. Có image preview/viewer ngay trong `SpreadsheetGrid` (không phải route riêng).
3. Viewer đã hỗ trợ chỉnh inline `Status` và `Phase`.
4. Có quick note, thumbnail strip, next/prev image, mở full edit.
5. Đã có nhiều vòng design trên Pencil (Main/Viewer/States/Style Guide).

### Khoảng trống hiện tại
1. Runtime UI chưa đồng bộ hoàn toàn với bản Pencil mới nhất.
2. Luồng điều hướng “Back to Main Project” mới ở mức design, chưa chốt behavior runtime.
3. Feature đang lẫn với grid tổng, chưa tách rõ module `Reported Image Review`.
4. Trạng thái loading/error/empty cho runtime chưa được chuẩn hóa end-to-end.
5. Chưa có bộ test tập trung cho workflow review ảnh reported.

### Rủi ro
1. Scope UI thay đổi nhanh gây lệch giữa design và code.
2. Cập nhật inline nhiều điểm (status/phase/note) dễ phát sinh state race.
3. Khi dữ liệu nhiều ảnh/category, hiệu năng render có thể giảm.

---

## 2) Roadmap theo phase

## Phase 1 - Stabilize UX nền tảng (MVP dùng được)
### Mục tiêu
- Chạy ổn định flow review ảnh reported với layout rõ ràng và không lỗi thị giác lớn.

### Việc làm
1. Áp header compact + chống overlap header/body trên runtime.
2. Thêm nút `Back to Main Project` và chốt luồng quay lại.
3. Fix các bug UI hiện có: button text center, quick note overflow, trigger status/phase rõ ràng.
4. Chốt mapping giữa `priority reported` và màn review để tránh nhầm với status.
5. Chốt entrypoint: bấm nút `Reported Image Review` trên toolbar để vào feature mode.

### Acceptance
1. Không còn overlap, không tràn text gây vỡ layout.
2. Quay lại main project bằng 1 click, đúng behavior.
3. Flow “mở reported -> review -> edit nhanh” chạy mượt.

---

## Phase 2 - Chuẩn hóa Data & Filtering
### Mục tiêu
- Dữ liệu và bộ lọc nhất quán cho mọi điểm vào của Reported Image Review.

### Việc làm
1. Chuẩn hóa selector dữ liệu: chỉ lấy item đúng điều kiện `priority = Reported`.
2. Filter theo category/subcategory/phase/status hoạt động đồng nhất với toolbar.
3. Định nghĩa rõ case item reported nhưng không có ảnh.
4. Đồng bộ cập nhật khi đổi status/phase khiến item ra/vào current view.

### Acceptance
1. Kết quả list/report đúng dữ liệu filter đang áp dụng.
2. Không có item “lọt/thiếu” khi đổi filter liên tục.
3. Case “reported but no image” hiển thị đúng state.

---

## Phase 3 - Viewer Workflow hoàn chỉnh
### Mục tiêu
- Viewer trở thành nơi xử lý chính cho reviewer, giảm phụ thuộc popup edit.

### Việc làm
1. Hoàn thiện inline edit status/phase với feedback rõ (saving/success/error).
2. Bổ sung next/prev theo item reported (không chỉ ảnh trong item).
3. Tối ưu layout ảnh dọc + thumbnail nhiều ảnh.
4. Cơ chế “Open Full Edit” giữ ngữ cảnh và quay lại viewer nhanh.

### Acceptance
1. Reviewer xử lý phần lớn case ngay trong viewer.
2. Save inline không gây lệch state giữa viewer và grid.
3. UX ảnh dọc rõ, không lãng phí diện tích lớn.

---

## Phase 4 - Reporting & Export theo ngữ cảnh review
### Mục tiêu
- Báo cáo/xuất dữ liệu phản ánh đúng view reviewer đang làm việc.

### Việc làm
1. Tách rõ 2 chế độ: `Export Current View` và `Export Full Data`.
2. Bổ sung report format theo object/team/status rule đã chốt.
3. Đảm bảo export gồm đúng cột đang show/hide khi chọn current view.
4. Đặt tên file export theo mode + timestamp rõ ràng.

### Acceptance
1. File export khớp đúng current view khi user chọn.
2. Full data export giữ hành vi legacy.
3. Không regression các report đã dùng.

---

## Phase 5 - Hardening, test, release
### Mục tiêu
- Sẵn sàng đưa vào dùng production ổn định.

### Việc làm
1. Viết test trọng điểm:
- filter + render list
- inline save status/phase
- viewer navigation
- export modes
2. Kiểm tra hiệu năng với dataset lớn (nhiều category/nhiều ảnh).
3. Bổ sung guardrail lỗi: retry, toast rõ, fallback state.
4. Chốt tài liệu vận hành ngắn cho team.

### Acceptance
1. Regression test pass cho luồng chính.
2. Không có lỗi blocker trên flow review ảnh.
3. Release checklist hoàn tất.

---

## 3) Thứ tự ưu tiên thực thi
1. Ưu tiên ngay: Phase 1 + phần cứng của Phase 2 (data/filter chuẩn).
2. Sau đó: Phase 3 để tăng tốc xử lý thực tế của reviewer.
3. Cuối cùng: Phase 4 và 5 để ổn định vận hành, báo cáo, release.

## 4) Gợi ý nhịp triển khai
1. Sprint A: Phase 1 + 2 (nền tảng + data consistency).
2. Sprint B: Phase 3 (viewer-first workflow).
3. Sprint C: Phase 4 + 5 (reporting + hardening).
