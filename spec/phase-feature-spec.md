# Phase Feature Specification

## 1. Mục tiêu

Triển khai tính năng `Phase` để người dùng có thể:

- Gán 1 item vào nhiều phase.
- Lọc item theo phase.
- Tăng diện tích hiển thị bằng cách ẩn hoàn toàn cột `%` khỏi UI.
- Hiển thị cột `Phase` ngay kế cột `Status`.
- Hỗ trợ hide/show cột `Phase`.

## 2. Phạm vi

Bao gồm:

- Data model cho phase ở item và settings.
- UI grid cột `Phase`.
- Filter phase.
- Xử lý các trường hợp phase chưa có dữ liệu thời gian.
- Tương thích ngược dữ liệu cũ.

Không bao gồm (ở scope sau):

- Thiết kế lại toàn bộ milestone/timeline UX.
- Báo cáo/phân tích nâng cao theo phase.

## 3. Thuật ngữ

- `Phase`: giai đoạn nghiệp vụ, dùng danh sách từ `milestones` hiện có.
- `Unscheduled Phase`: phase có tồn tại nhưng chưa có `startDate/endDate`.
- `None` phase: item chưa gán phase nào.

## 4. Yêu cầu chức năng

### 4.1 Bố cục cột

- Cột `%` không hiển thị trên UI (header, cell, nút restore).
- Cột `Phase` nằm ngay sau cột `Status`.
- Thứ tự cột trái mục tiêu:
  - `ID | Features | Priority (nếu bật) | Status | Phase | Start | End | Actions`

### 4.2 Cột Phase

- Cột `Phase` có thể hide/show tương tự các cột đang có.
- Trạng thái hide/show của cột `Phase` được persist trong settings.
- Item có nhiều phase hiển thị nhiều tag trong ô `Phase`.
- Item chưa gán phase hiển thị `—`.

### 4.3 Tag Phase trên item

- Tag hiển thị `label` của phase.
- Nếu `phaseId` không còn tồn tại trong danh sách phase, hiển thị nhãn fallback `Unknown`.
- Số lượng tag lớn hơn diện tích ô sẽ truncate/overflow an toàn, không vỡ layout.

### 4.4 Filter Phase

- Filter phase là multi-select.
- Logic lọc:
  - OR trong nhóm phase.
  - AND với nhóm filter khác (category/status/team/priority/subcategory).
- Có thêm lựa chọn `None` để lọc item chưa gán phase.
- Khi chưa có phase nào:
  - Nhóm filter phase disable.
  - Hiển thị trạng thái `Chưa có phase`.

### 4.5 Quản lý phase chưa có thời gian

- Phase không bắt buộc phải có thời gian.
- Trường hợp phase không có `startDate/endDate`:
  - Vẫn gán được vào item.
  - Vẫn filter được.
  - Không tô milestone block trên timeline.
- Trường hợp chỉ có 1 đầu mốc:
  - Normalize thành phase 1 ngày (copy sang đầu còn lại).
- Trường hợp `startDate > endDate`:
  - Chặn lưu, hiển thị lỗi validation.

## 5. Data model

## 5.1 `RoadmapItem`

Thêm field:

- `phaseIds?: string[]`

## 5.2 `RoadmapDocument.settings`

Thêm field:

- `colPhase?: boolean`
- `filterPhase?: string[]`

## 5.3 Nguồn dữ liệu phase

- V1 sử dụng `milestones` hiện tại làm danh sách phase.
- Không thay đổi contract API backend vì dữ liệu đang lưu dạng JSON blob.

## 6. Tương thích ngược và normalize

- Dữ liệu cũ không có `phaseIds`, `colPhase`, `filterPhase` vẫn hoạt động bình thường.
- Khi load:
  - Mặc định `colPhase = true` nếu chưa có.
  - Mặc định `filterPhase = []` nếu chưa có.
  - `phaseIds` không hợp lệ sẽ normalize về mảng hợp lệ hoặc rỗng.
- Không làm thay đổi format cũ của `progress`.

## 7. Hành vi timeline

- Chỉ phase có date range hợp lệ mới xuất hiện vùng milestone/tô nền timeline.
- Unscheduled phase không render block trên timeline nhưng vẫn tồn tại trong danh sách phase để gán/filter.

## 8. Acceptance criteria

- UI không còn hiển thị cột `%`.
- Cột `Phase` đứng kế cột `Status`.
- Cột `Phase` có hide/show và lưu lại sau refresh.
- Item hiển thị tag phase đúng theo `phaseIds`.
- Không có phase: hệ thống không lỗi, cột phase hiển thị `—`, filter phase disable.
- Phase không có date: gán và lọc được, timeline không vẽ block phase đó.
- Save/load JSON giữ đúng dữ liệu phase và settings liên quan.

## 9. Kế hoạch triển khai

1. Cập nhật type/schema (`phaseIds`, `colPhase`, `filterPhase`) và normalize.
2. Cập nhật `page.tsx` để load/persist settings phase.
3. Cập nhật `SpreadsheetGrid`:
   - Bỏ `%` khỏi UI.
   - Thêm cột `Phase` ngay sau `Status`.
   - Thêm hide/show cho cột `Phase`.
4. Cập nhật filter popup + logic lọc tree cho phase.
5. Cập nhật editor phase để hỗ trợ unscheduled/validation thời gian.
6. Regression test các luồng save/load/filter/timeline.

## 10. Hiển thị phase khi ẩn cột Phase

- Row `group` hiển thị phase dạng rút gọn `P1`, `P2`, ... ngay sau khi gán phase.
- Vị trí tag rút gọn: ngay trước tên `group` trong cột `Features`.
- Nếu `group` chưa có `phaseIds` trực tiếp, phase sẽ được suy ra từ descendants.
- Hiển thị tối đa 2 tag và phần dư dưới dạng `+N` để không vỡ layout.
- Nếu không có phase, không hiển thị tag rút gọn.
