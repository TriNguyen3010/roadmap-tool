# Plan: Thêm Phase selector ngoài toolbar (cạnh dàn nút bên trái)

## Mục tiêu
- Cho user chọn/lọc `Phase` ngay trên thanh toolbar chính, không cần mở popup Filter.
- Đặt control `Phase` cạnh cụm quick buttons bên trái (Feature/Improvement/Bug/Web/App/Reported).
- Đồng bộ hoàn toàn với state `filterPhase` hiện có.

## Phạm vi
Bao gồm:
1. UI chọn phase ở toolbar bên trái.
2. Wiring state giữa `Toolbar` và `page.tsx`.
3. Đồng bộ 2 chiều với `FilterPopup` và cơ chế save settings hiện tại.

Không bao gồm:
- Thay đổi logic filter backend/helpers.
- Thay đổi cấu trúc dữ liệu phase/milestones.

## UX đề xuất
- Thêm cụm `Phase` ngay sau quick buttons bên trái:
  - Nút trigger: `Phase` hoặc `Phase (n)` khi có n phase đang chọn.
  - Click mở dropdown nhỏ, multi-select checklist theo danh sách phase hiện có.
  - Có action `Select all` + `Clear` để thao tác nhanh khi phase nhiều.
- Khi không có milestone/phase nào:
  - Control vẫn hiện nhưng disabled + tooltip `Chưa có phase`.
- Khi phase nhiều:
  - Có ô `Search phase...` trong dropdown.
  - Danh sách giới hạn chiều cao và `scroll`.
  - Hỗ trợ nút `Only` theo từng phase để lọc nhanh 1 phase.

## Thiết kế kỹ thuật
### 1) `page.tsx`
- Tạo `availablePhases` (id/label) và truyền xuống `Toolbar`.
- Truyền thêm callback riêng cho toolbar phase filter:
  - `onPhaseFilterChange(values: string[])`.
- Callback này dùng cùng normalize hiện tại (`normalizePhaseFilterValues`) để đồng bộ rule.

### 2) `Toolbar.tsx`
- Mở rộng props:
  - `availablePhases: PhaseOption[]`
  - `filterPhase: string[]`
  - `onPhaseFilterChange: (values: string[]) => void`
- Thêm UI dropdown multi-select trong cụm trái, cạnh quick buttons.
- Đóng dropdown khi click outside / Esc.

### 3) Đồng bộ với filter hiện có
- Toolbar Phase selector và `FilterPopup` cùng đọc/ghi `filterPhase` của parent.
- Khi user thao tác ở một nơi, nơi còn lại phản ánh đúng ngay lập tức.

### 4) Persist settings
- Giữ nguyên luồng save/load settings vì `filterPhase` đã có sẵn trong snapshot.
- Không cần thay đổi schema `roadmap.json`.

## Kế hoạch triển khai
### Bước 1: Update props + state flow
- Bổ sung props phase selector cho `Toolbar`.
- Wire callback từ `page.tsx`.

### Bước 2: Render Phase selector bên trái
- Chèn control vào khu vực quick filter buttons bên trái.
- Implement dropdown multi-select + search + select all + clear.

### Bước 3: Interaction rules
- Click outside / Esc đóng dropdown.
- Disabled state khi không có phase.
- Hiển thị count phase đang chọn trên nút trigger.
- Dropdown danh sách phase có max-height + overflow auto để chịu tải phase lớn.

### Bước 4: Verify
1. Chọn phase ở toolbar -> grid lọc đúng.
2. Chọn phase ở FilterPopup -> toolbar phản ánh đúng.
3. Reload trang -> `filterPhase` giữ đúng từ settings.
4. Không có phase -> control disabled, không lỗi.
5. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro toolbar quá chật trên màn hình nhỏ:
  - Dùng trigger ngắn + dropdown thay vì render toàn bộ chip cố định.
- Rủi ro lệch state giữa Toolbar và Popup:
  - Dùng 1 source-of-truth (`filterPhase` ở `page.tsx`).
- Rủi ro phase id cũ/invalid từ settings:
  - Chuẩn hóa qua `normalizePhaseFilterValues` trước khi set state.
- Rủi ro lag khi phase tăng nhiều:
  - Giữ dropdown list đơn giản + search + scroll; nếu phase tăng rất lớn sẽ nâng cấp virtualized list ở vòng sau.

## Tiêu chí hoàn tất
1. User có thể lọc phase trực tiếp ngoài toolbar bên trái.
2. UI phase selector nằm đúng vị trí yêu cầu (cạnh dàn nút bên trái).
3. State phase đồng bộ với popup và persisted settings.
4. Không phát sinh lỗi lint/build.
