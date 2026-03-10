# Plan: Xuất Excel theo đúng view hiện tại của user

## Mục tiêu
- File Excel phải phản ánh đúng dữ liệu user đang thấy trên grid:
  - theo filter đang bật
  - theo trạng thái mở/đóng nhánh (expanded/collapsed)
  - theo các dòng đã hide
  - theo các cột đang bật/tắt (show/hide) của user

## Hiện trạng
- `handleExportExcel` đang gọi `exportRoadmapToExcel(data)` với toàn bộ cây dữ liệu.
- Logic hiện tại chưa dùng `filter`, `expandedIds`, `hiddenRowIds` của view runtime.
- Header/cột export đang cố định, chưa bám trạng thái cột show/hide trên UI.

## Phạm vi
Bao gồm:
1. Tính tập row “visible” đúng theo view.
2. Tính tập cột “visible” đúng theo view (show/hide).
3. Truyền rows + columns này vào luồng export Excel.
4. Giữ milestone sheet như hiện tại.

Không bao gồm:
- Tạo nhiều mode export (All vs Current View) ở vòng này.

## Kế hoạch triển khai
### Bước 1: Chuẩn hoá logic “current view” dùng chung
- Tạo helper dùng chung (ưu tiên đặt ở `roadmapHelpers.ts`) để tránh duplicate logic giữa grid và export:
  1. `filterRoadmapTree(...)` với các filter đang chọn.
  2. `flattenRoadmap(...)`.
  3. Loại các node có ancestor đang collapsed (`expandedIds`).
  4. Loại leaf rows đang bị hide (`hiddenRowIds`).

### Bước 2: Tính visible columns ở `page.tsx`
- Build danh sách cột export theo đúng thứ tự cột grid:
  1. `ID`
  2. `Tên`
  3. `WorkType` (nếu `showWorkType=true`)
  4. `Priority` (nếu `showPriority=true`)
  5. `Status` (luôn có cột, nhưng giá trị có thể rỗng ở level category/subcategory như UI)
  6. `Phase` (nếu `showPhase=true`)
  7. `Ngày bắt đầu` (nếu `showStartDate=true`)
  8. `Ngày kết thúc` (nếu `showEndDate=true`)

### Bước 3: Mở rộng API export
- File: `src/utils/exportToExcel.ts`.
- Cho phép export nhận:
  - `rows` theo current view.
  - `columns` theo current view.
- Nếu không truyền `rows/columns`, fallback behavior cũ để không phá backward compatibility.

### Bước 4: Kết nối từ `handleExportExcel`
- File: `src/app/page.tsx`.
- `handleExportExcel` sẽ truyền đúng `visibleRows + visibleColumns` cho export util.
- Toast success/error giữ nguyên.

### Bước 5: Đồng bộ dữ liệu cell với UI
- Đảm bảo thứ tự dòng trong Excel khớp thứ tự đang hiển thị trên grid.
- Đảm bảo indent level (độ sâu) lấy từ flattened view.
- Đảm bảo mapping value theo cột:
  - `Phase`: xuất text nhãn phase đang hiển thị (ví dụ `Phase 1`) hoặc danh sách ngăn cách bằng `, ` nếu nhiều phase.
  - `WorkType/Priority`: đúng value đang render.
  - `Status` ở category/subcategory: để trống để khớp rule UI hiện tại.

### Bước 6: Test
1. Bật filter (status/team/phase/workType...) -> Excel chỉ có rows khớp filter.
2. Collapse 1 nhánh -> Excel không chứa rows con đang bị ẩn.
3. Hide leaf rows -> Excel không chứa các dòng đã hide.
4. Bật/tắt các cột (`WorkType`, `Priority`, `Phase`, `StartDate`, `EndDate`) -> header + dữ liệu Excel đổi đúng theo UI.
5. Không filter + expand all + full cột -> Excel gần tương đương full view.
6. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro lệch logic giữa grid và export:
  - dùng cùng helper current-view để tránh duplicate logic.
- Rủi ro mất context cha/con khi filter:
  - giữ đúng output của `filterRoadmapTree` như grid đang render.
- Rủi ro lệch thứ tự cột giữa grid và Excel:
  - định nghĩa một source-of-truth cho thứ tự cột và tái sử dụng.
- Rủi ro đổi API export gây ảnh hưởng chỗ khác:
  - thêm param tùy chọn, giữ fallback cũ.

## Tiêu chí hoàn tất
1. Excel xuất ra khớp view user đang nhìn.
2. Excel chỉ chứa đúng các cột user đang bật trên UI tại thời điểm export.
3. Không còn tình trạng export toàn bộ data khi user đang filter/collapse/hide.
4. Lint/build pass.
