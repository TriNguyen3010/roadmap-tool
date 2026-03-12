# Plan: Kiểm tra `Summary by Object` khi có `Phase 2` nhưng không hoạt động

## Bối cảnh
- Hiện tại user đã thêm `Phase 2` và kỳ vọng `Summary by Object` phản ánh đúng theo phase.
- Triệu chứng: summary không ra dữ liệu đúng khi làm việc với `Phase 2`.
- Baseline theo ảnh user upload:
  - Nhiều block ra `Không có dữ liệu` dù kỳ vọng có data.
  - Tiêu đề/chuỗi dài bị cắt hiển thị (`App (Mobi...)`, `Không có d...`), gây khó kiểm tra đúng/sai.

## Nhận định nhanh từ code hiện tại
1. `Summary by Object` đang build trong `src/utils/exportToExcel.ts` (hàm `buildSummaryRowsByObject`), nhưng chưa có rule lọc phase riêng.
2. Summary block `App/Core/Web` đang lọc theo `group.status` + `subcategory`, không lọc theo `phaseIds`.
3. Summary lấy dữ liệu từ `rows` truyền vào export; với `current-view`, `rows` hiện tại là `exportVisibleRows` (phụ thuộc expand/collapse + hidden row), có thể làm thiếu item/group liên quan phase.
4. Độ rộng cột summary đang cố định (`8`, `92`) nên text ở cột A dễ bị cắt, làm nhiễu việc kiểm chứng dữ liệu.

## Mục tiêu
1. Xác định chính xác vì sao `Phase 2` không phản ánh trong summary.
2. Chuẩn hóa rule summary theo phase để hoạt động ổn định khi có nhiều phase.
3. Cải thiện format summary để text không bị cắt, dễ review.
4. Không làm vỡ behavior `Export Current View` và `Export Full Data`.

## Phase 1 - Audit theo baseline hiện tại (không reproduce lại)
1. Dùng trực tiếp file/ảnh hiện tại làm baseline lỗi.
2. Đối chiếu tại code export:
   - `rows` nào được đưa vào summary.
   - điều kiện lọc `App/Core/Web` và các team blocks.
3. Thêm log debug ngắn (local) để đọc nhanh:
   - tổng rows summary input.
   - số rows có `phaseIds` chứa `phase_2` theo từng `type`.
4. Khoanh vùng rõ lỗi thuộc:
   - rule lọc phase,
   - nguồn rows (current-view bị phụ thuộc expand/collapse),
   - hay chỉ là lỗi hiển thị do width.

## Phase 2 - Chốt rule nghiệp vụ Summary theo Phase
1. Chốt nguồn dữ liệu summary:
   - Option A: bám đúng filtered scope nhưng không phụ thuộc expand/collapse.
   - Option B: bám đúng rows đang hiển thị thực tế (bao gồm trạng thái thu gọn).
2. Chốt điều kiện phase:
   - Nếu có phase filter: summary chỉ lấy rows match phase đã chọn.
   - Nếu không filter phase: summary lấy toàn bộ scope.
3. Chốt rule cho `App/Core/Web`:
   - tiếp tục dùng `group.status` như hiện tại, hoặc
   - đổi sang dựa trên item con theo phase để tránh miss khi group status không phản ánh phase.
4. Chốt rule hiển thị summary:
   - tăng width cột A/B hoặc auto-fit để không cắt text.
   - title/`Không có dữ liệu` luôn đọc được đầy đủ.

## Phase 3 - Implement fix
1. Refactor `buildSummarySheetData/buildSummaryRowsByObject` để nhận context filter phase.
2. Nếu cần, tách `summarySourceRows` khỏi `exportVisibleRows` để không bị ảnh hưởng expand/collapse.
3. Chỉnh width/format sheet `Summary by Object` để tránh cắt chuỗi quan trọng.
4. Giữ nguyên xuất cột của sheet `Roadmap` theo đúng mode hiện tại.
5. Đảm bảo `Full Data` vẫn không append summary nếu `includeSummary: false`.

## Phase 4 - QA + regression
1. Test matrix:
   - Phase 1 only / Phase 2 only / multi-phase.
   - Group có phase trên chính group vs phase chỉ nằm ở item con.
   - Group collapsed/expanded khi export current view.
2. Kiểm tra các block summary:
   - `App/Core/Web`
   - `Team BA/PD/Dev/QC/Growth`
3. So sánh file Excel trước/sau fix để đảm bảo không vỡ format (`ID`, `Nội dung`, thứ tự block).
4. Kiểm tra visual:
   - `App (Mobile)` hiển thị đủ.
   - `Không có dữ liệu` hiển thị đủ.

## Kết quả mong đợi
1. Chọn `Phase 2` và export thì `Summary by Object` ra đúng tập dữ liệu phase đó.
2. Khi có nhiều phase, summary không bị phụ thuộc ngẫu nhiên vào trạng thái expand/collapse (theo rule đã chốt).
3. Sheet summary hiển thị rõ, không cắt text gây hiểu nhầm.
4. Không ảnh hưởng các luồng export khác.

## Files dự kiến tác động
1. `src/utils/exportToExcel.ts`
2. `src/app/page.tsx` (nếu cần truyền thêm context/filter cho summary)
3. (Tuỳ chọn) test mới cho export summary.
