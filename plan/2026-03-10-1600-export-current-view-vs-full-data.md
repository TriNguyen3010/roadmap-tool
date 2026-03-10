# Plan: Tách 2 mode Export Excel (`Current View` vs `Full Data`)

## Mục tiêu
- Cho user chọn rõ 2 hành vi export:
  1. `Export Current View` (mới): đúng dữ liệu/cột theo UI đang filter + hide/show.
  2. `Export Full Data` (giống cũ): xuất full tree theo format legacy.
- Tránh hiểu nhầm khi user kỳ vọng file full nhưng hệ thống lại xuất theo view hiện tại.

## Định nghĩa mode
1. `Export Current View`
- Dữ liệu: dùng `visibleRows` (đã qua filter + expanded + hiddenRowIds).
- Cột: dùng `visibleColumns` theo trạng thái show/hide cột trên UI.
- Có thể giữ thêm sheet summary mới (nếu đã bật tính năng report).

2. `Export Full Data`
- Dữ liệu: toàn bộ `data.items` (không filter, không collapse, không hidden row).
- Cột: theo legacy cũ (`ID, Tên, Loại, Trạng thái, Tiến độ (%), Ngày bắt đầu, Ngày kết thúc`).
- Mặc định không phụ thuộc cột đang show/hide trên UI.
- Nếu mục tiêu là “giống cũ tuyệt đối”, cần tắt sheet summary ở mode này.

## Phạm vi
Bao gồm:
1. UI chọn mode export trong `Toolbar`.
2. Tách handler export ở `page.tsx`.
3. Mở rộng API export util để hỗ trợ mode/fallback rõ ràng.
4. Test 2 mode độc lập.

Không bao gồm:
- Thay đổi logic filter/grid runtime.
- Thêm format file khác ngoài `.xlsx`.

## Thiết kế kỹ thuật
### 1) Toolbar
- Thay nút `Xuất Excel` hiện tại thành 2 action:
  - `Xuất Excel (Current View)`
  - `Xuất Excel (Full Data)`
- Có thể dùng 2 nút riêng trong section `Hành động` để thao tác nhanh, tránh thêm popup phức tạp.

### 2) Page handlers
- Tạo 2 handler riêng:
  - `handleExportExcelCurrentView()` -> gọi util với `rows + columns` từ current view.
  - `handleExportExcelFullData()` -> gọi util theo đường legacy (`exportRoadmapToExcel(data)`) hoặc truyền `mode: 'full'`.
- Cập nhật toast để user biết đã export mode nào.

### 3) Export util contract
- Mở rộng options (nếu cần) theo hướng rõ nghĩa:
  - `mode?: 'current-view' | 'full-data'`
  - `rows?: FlattenedItem[]`
  - `columns?: ExcelExportColumn[]`
  - `includeSummary?: boolean`
- Rule mặc định đề xuất:
  - `current-view`: `includeSummary = true`
  - `full-data`: `includeSummary = false` (để gần “giống cũ”).

### 4) Backward compatibility
- Giữ hành vi cũ cho call-site cũ:
  - Nếu gọi `exportRoadmapToExcel(data)` không options -> coi là `full-data legacy`.

## Kế hoạch triển khai
### Bước 1: Refactor props Toolbar
- Đổi từ 1 prop `onExportExcel` thành 2 props:
  - `onExportExcelCurrentView`
  - `onExportExcelFullData`
- Update UI settings panel với 2 nút export.

### Bước 2: Tách handler ở page
- Dùng `exportVisibleRows/exportVisibleColumns` cho current-view.
- Dùng `data` thuần cho full-data.

### Bước 3: Cập nhật export util
- Bổ sung options `mode/includeSummary`.
- Đảm bảo mode `full-data` không bị áp rule current-view.
- Nếu mục tiêu “giống cũ tuyệt đối”: không append summary ở full-data.

### Bước 4: Verify
1. Đang filter + hide cột -> `Current View` xuất đúng như đang nhìn.
2. Cùng trạng thái đó -> `Full Data` vẫn ra full tree + cột legacy.
3. So sánh file `Full Data` với behavior cũ (trước khi có current-view) để xác nhận tương đương.
4. `npm run lint` + `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro user bấm nhầm mode:
  - Label nút rõ ràng + toast phản hồi mode đã xuất.
- Rủi ro util bị chồng chéo logic mode:
  - Dùng nhánh mode tường minh, hạn chế inference.
- Rủi ro khác kỳ vọng về summary sheet:
  - Chốt rule: `Full Data` mặc định không summary.

## Tiêu chí hoàn tất
1. User có thể chọn 2 mode export riêng biệt ngay trên UI.
2. `Current View` và `Full Data` cho kết quả khác nhau đúng theo định nghĩa.
3. `Full Data` giữ hành vi legacy như yêu cầu.
4. Build/lint pass.
