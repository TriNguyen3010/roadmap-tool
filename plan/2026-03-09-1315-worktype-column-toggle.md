# Plan: WorkType thành cột riêng + hide/show

## Mục tiêu
- Tách `WorkType` khỏi cột Name thành **1 cột riêng**.
- Cột `WorkType` có thể **hide/show** giống `Priority`, `Phase`, `Start Date`, `End Date`.
- Dữ liệu nguồn vẫn là `groupItemType` (chỉ áp dụng cho node `group`).

## Quyết định thiết kế
- Thêm cờ hiển thị cột: `showWorkType` (state UI).
- Persist vào settings: `colWorkType?: boolean`.
- Vị trí cột: `WorkType` đặt **trước cột `Priority`**.
- Cột `WorkType`:
  - Chỉ hiển thị giá trị cho row `group`.
  - Row không phải `group` hiển thị trống hoặc `-` (ưu tiên trống để đỡ nhiễu).
- Bỏ **hẳn** badge `groupItemType` khỏi cột Name (không phụ thuộc trạng thái bật/tắt cột WorkType).

## Phạm vi
Bao gồm:
1. Settings + state + persist cho `colWorkType`.
2. Grid layout thêm cột `WorkType` (header + body).
3. Nút hide/show cột `WorkType` trong cụm điều khiển cột.
4. Điều chỉnh width/name auto-fit liên quan badge cũ trong Name.

Không bao gồm:
- Inline edit `WorkType` trực tiếp trên cell.
- Thay đổi rule dữ liệu (vẫn group-only).

## Kế hoạch triển khai

### Bước 1: Schema settings
- `src/types/roadmap.ts`
  - Thêm `colWorkType?: boolean` vào `RoadmapDocument.settings`.

### Bước 2: State + load/save
- `src/app/page.tsx`
  - Thêm state `showWorkType` (default `true`).
  - Load từ `settings.colWorkType` khi fetch JSON/import JSON.
  - Persist vào snapshot ở `buildDocumentSnapshot`.
  - Truyền props `showWorkType`, `setShowWorkType` xuống `SpreadsheetGrid`.

### Bước 3: Grid props + layout
- `src/components/SpreadsheetGrid.tsx`
  - Mở rộng `GridProps` với `showWorkType`, `setShowWorkType`.
  - Thêm constant width cột (ví dụ `COL_WORK_TYPE_W = 110`).
  - Cập nhật `leftWidth` + `gridTemplateColumns` để include cột này khi bật.
  - Thứ tự cột trong vùng fixed-left: `Name -> WorkType -> Priority -> Phase -> Start Date -> End Date`.
  - Header:
    - Thêm title `WorkType`.
    - Có nút hide cột (x) tương tự các cột khác.
  - Toolbar cột ẩn:
    - Thêm nút “Hiện cột WorkType”.
  - Body:
    - Cell `WorkType` chỉ render badge cho `row.type === 'group' && row.groupItemType`.
    - Không phải group thì render trống.

### Bước 4: Dọn hiển thị trong Name
- `src/components/SpreadsheetGrid.tsx`
  - Bỏ hẳn badge `groupItemType` ở cột Name.
  - Cập nhật auto-width Name:
    - Gỡ phần cộng extra width cho `groupItemType` badge trong Name.

### Bước 5: Regression test
- Luồng hiển thị:
  - Bật/tắt `WorkType` hoạt động ổn định.
  - Cột bật: hiện đúng giá trị cho group, row khác không nhiễu.
  - Cột tắt: layout không lệch.
- Luồng persist:
  - Reload và Import JSON giữ đúng trạng thái `colWorkType`.
- Build quality:
  - `npm run lint`
  - `npm run build`

## Rủi ro và giảm thiểu
- Rủi ro vỡ layout do thêm cột:
  - Giảm thiểu: dùng width cố định, kiểm tra lại `leftWidth/gridTemplateColumns`.
- Rủi ro duplicate thông tin giữa Name và WorkType:
  - Giảm thiểu: bỏ badge WorkType ở Name khi đã có cột riêng.

## Tiêu chí hoàn tất
1. Có cột `WorkType` riêng trong grid.
2. Cột `WorkType` đứng trước `Priority`.
3. Badge `WorkType` không còn xuất hiện ở cột Name.
4. Có thể hide/show cột `WorkType`.
5. Trạng thái hide/show được lưu trong settings.
6. Không ảnh hưởng các cột hiện có và build/lint pass.
