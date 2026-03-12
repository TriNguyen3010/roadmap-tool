# Plan: Đổi thuật ngữ `Phase` sang `Week` trên toàn bộ tool

## Mục tiêu
1. Toàn bộ UI/label/message của tool hiển thị `Week` thay cho `Phase`.
2. Export/report/filter đồng bộ thuật ngữ `Week`.
3. Mỗi `Week` ở cột `Week` có màu riêng để dễ nhận diện.
4. Không làm vỡ dữ liệu JSON hiện có và logic lọc/apply date đang chạy.

## Quyết định kỹ thuật
1. **Đổi ở tầng hiển thị** (user-facing): `Phase` -> `Week`.
2. **Giữ nguyên schema/key nội bộ** để backward-compatible:
- `phaseIds`
- `filterPhase`
- `colPhase`
- util/hàm `phase*`
- `milestones` (key dữ liệu)
3. Nếu cần đổi schema thật sự (`phaseIds` -> `weekIds`) sẽ làm phase riêng sau.
4. Dùng `milestones[].color` làm nguồn màu cho `Week`; nếu thiếu màu thì fallback theo palette mặc định.

## Phạm vi đổi text bắt buộc
1. Toolbar:
- `Phase`, `Phases`, `Phase Filter` -> `Week`, `Weeks`, `Week Filter`.
2. Filter popup:
- section `Phase`, message `Chưa có phase...`, `None (chưa gán phase)` -> bản `Week`.
3. Grid:
- header cột `Phase` -> `Week`.
- tooltip/empty text `No phase` -> `No week`.
- viewer text `Status/Phase` -> `Status/Week`.
- tag viết tắt: `P1/P2` -> `W1/W2` (nếu dùng short tag).
- cell/tag `Week` hiển thị màu theo đúng week đã gán (mỗi week một màu).
4. Edit popup / Reported viewer:
- toàn bộ label/placeholder/dropdown liên quan phase -> week.
- chip/tag week trong popup/viewer đồng bộ màu với cột Week.
5. Milestone editor:
- title/subtitle/button/input/help text `Phase` -> `Week`.
- `Unscheduled/Scheduled` giữ nguyên.
6. Toast/confirm trong page:
- các câu `phase chưa có lịch`, `theo phase này` -> `week chưa có lịch`, `theo week này`.
7. Export Excel:
- cột `Phase` -> `Week`.
- sheet `Milestones` -> `Weeks`.
- header `Tên Milestone` -> `Tên Week`.

## Rule migration label mặc định
1. Nhãn auto fallback mới:
- `Phase ${n}` -> `Week ${n}`.
2. Với dữ liệu cũ:
- nếu label match pattern mặc định `^Phase\\s+\\d+$` thì tự chuyển thành `Week n`.
- label custom khác giữ nguyên nội dung để tránh đổi nhầm text nghiệp vụ.

## Rule màu cho Week
1. Mỗi week có màu duy nhất lấy từ `milestones[].color`.
2. Nếu nhiều week được gán cho một item/group:
- hiển thị nhiều tag/chip, mỗi tag giữ màu của week tương ứng.
3. Nếu week không có màu:
- tự gán fallback color theo index (palette cố định), và lưu lại khi user save milestone.
4. Cần giữ tương phản chữ/nền (AA) để đọc được trong grid và dropdown.

## Phase triển khai
### Phase 1 - Chuẩn hóa terminology constants
1. Tạo constants/helper cho text hiển thị:
- `WEEK_TERM_SINGULAR = 'Week'`
- `WEEK_TERM_PLURAL = 'Weeks'`
- helper default label `Week ${index+1}`.
2. Giảm hardcode chuỗi `Phase` rải rác để tránh sót.
3. Chuẩn hóa helper lấy màu week từ `milestones`.

### Phase 2 - UI surface replacement
1. Cập nhật các component:
- `Toolbar.tsx`
- `FilterPopup.tsx`
- `SpreadsheetGrid.tsx`
- `EditPopup.tsx`
- `MilestoneEditor.tsx`
2. Cập nhật `src/app/page.tsx` cho toàn bộ message/toast liên quan.
3. Cập nhật UI chip/tag cột Week để render theo màu week.

### Phase 3 - Data display fallback + export
1. Cập nhật fallback label trong:
- `page.tsx` (`normalizeMilestones`, `availablePhases`)
- `SpreadsheetGrid.tsx`
- `exportToExcel.ts`
2. Cập nhật sheet/column export:
- `Phase` -> `Week`
- `Milestones` -> `Weeks`
- `Tên Milestone` -> `Tên Week`
3. Nếu export có cột Week, text week giữ đúng label; (màu trong excel là optional, không bắt buộc ở phase này).

### Phase 4 - QA regression
1. Luồng gán/đổi week ở grid + edit popup + viewer vẫn hoạt động.
2. Filter week và hide/show cột week đúng.
3. Apply date theo week vẫn đúng logic cũ.
4. Export current/full data mở được file và dùng thuật ngữ week.
5. JSON save/load/import từ dữ liệu cũ không lỗi.
6. Mỗi week có màu riêng, hiển thị đồng nhất ở:
- cột Week
- tag W1/W2
- dropdown chọn week
- viewer/edit popup

## Rủi ro
1. Sót text `Phase` do hardcode nhiều nơi.
2. Sót ngữ cảnh ở report/viewer (đặc biệt các tooltip và empty-state).
3. Nếu đổi tên sheet export có thể ảnh hưởng thói quen người dùng cũ.
4. Màu week thiếu tương phản trên một số nền cell/theme.

## Kết quả mong đợi
1. Người dùng chỉ nhìn thấy `Week` trên toàn bộ tool.
2. Không phát sinh migration dữ liệu rủi ro cao.
3. Tất cả tính năng cũ chạy ổn định với thuật ngữ mới.

## Cập nhật triển khai (2026-03-12)
1. Đã đổi label hiển thị từ `Phase` -> `Week` tại toolbar, filter popup, milestone editor, grid header, viewer, toast/confirm.
2. Đã đổi fallback label tự sinh `Phase n` -> `Week n` bằng helper `normalizeWeekLabel`.
3. Đã đổi export:
- cột `Phase` -> `Week`
- sheet `Milestones` -> `Weeks`
- `Tên Milestone` -> `Tên Week`
4. Đã bổ sung rule màu tuần:
- thêm `WEEK_COLOR_PALETTE`, `getWeekColorByIndex`, `normalizeWeekColor`
- mọi dot/chip/tag/dropdown Week dùng cùng rule màu
- dữ liệu cũ thiếu `color` sẽ tự nhận màu theo index week.
5. Giữ nguyên key/schema nội bộ (`phaseIds`, `filterPhase`, `colPhase`) để tương thích dữ liệu cũ.
