# Plan: Export thêm cột Note vào Excel

## Mục tiêu
- Khi export Excel, sheet `Roadmap` phải có thêm thông tin `quickNote` của từng row.
- Áp dụng cho cả 2 mode:
  - `Export Current View`
  - `Export Full Data`
- Không làm vỡ flow export hiện tại và không đổi format của sheet `Summary by Object`.

## Hiện trạng
- Dữ liệu item đã có field `quickNote` trong `src/types/roadmap.ts`.
- `src/utils/exportToExcel.ts` hiện chỉ hỗ trợ các cột:
  - `id`, `name`, `type`, `workType`, `priority`, `status`, `phase`, `progress`, `startDate`, `endDate`
- `src/app/roadmap/[id]/page.tsx` đang build danh sách cột export visible nhưng chưa có `note`.
- Vì grid hiện chưa có cột Note riêng, nếu muốn xuất note thì cần coi đây là một cột export-only hoặc bổ sung rule riêng cho export.

## Phạm vi
Bao gồm:
1. Thêm cột `Note` vào schema export Excel.
2. Mapping giá trị từ `row.quickNote`.
3. Bật cột này cho cả `Current View` và `Full Data`.
4. Tối ưu hiển thị Excel để note dài vẫn đọc được.

Không bao gồm:
1. Thêm cột Note lên grid UI.
2. Đổi nội dung sheet `Summary by Object`.
3. Tạo toggle show/hide Note riêng trong toolbar ở vòng này.

## Quy ước đề xuất
- Cột mới dùng id `note`, header `Note`.
- Giá trị lấy từ `row.quickNote || ''`.
- Với `Current View`, `Note` vẫn được export dù grid chưa có cột này.
  - Đây là ngoại lệ có chủ đích theo yêu cầu business, không phải mirror UI tuyệt đối.
- Vị trí cột đề xuất:
  - sau `Tên`, trước `WorkType`/`Priority` để note nằm gần nội dung item.

## Kế hoạch triển khai

### Bước 1: Mở rộng schema export
- File: `src/utils/exportToExcel.ts`
- Bổ sung `note` vào:
  - `ExcelExportColumnId`
  - `DEFAULT_COLUMN_WIDTH`
  - danh sách cột mặc định cho mode full data / legacy fallback nếu cần

### Bước 2: Mapping cell Note
- Cập nhật `getCellValue(...)` để support:
  - `case 'note': return row.quickNote || ''`
- Giữ rule đơn giản:
  - không trim quá mức để tránh mất format user đã nhập
  - item không có note thì để trống

### Bước 3: Gắn cột Note vào flow Current View
- File: `src/app/roadmap/[id]/page.tsx`
- Cập nhật `exportVisibleColumns` để thêm:
  - `{ id: 'note', header: 'Note' }`
- Chèn đúng vị trí sau cột `Tên`.
- Vì đây là cột export-only, không phụ thuộc `showWorkType/showPriority/...`

### Bước 4: Gắn cột Note vào flow Full Data
- File: `src/utils/exportToExcel.ts`
- Đảm bảo khi `handleExportExcelFullData` dùng default columns thì `note` cũng xuất ra.
- Nếu current fallback đang dùng `LEGACY_COLUMNS`, cần update luôn để full-data không bị thiếu note.

### Bước 5: Tối ưu format Excel cho cột Note
- Tăng width mặc định cho `note` lớn hơn cột text ngắn.
- Cân nhắc bật wrap text cho cột `note` hoặc cho toàn bộ body cell text nếu thư viện hiện tại hỗ trợ ổn định trong flow đang dùng.
- Nếu chưa muốn can thiệp style sâu, ưu tiên width đủ rộng trước để giảm rủi ro.

### Bước 6: Kiểm tra tương thích
- Xác nhận export không ảnh hưởng:
  - thứ tự dòng
  - summary sheet
  - milestone sheet
  - mode `current-view` và `full-data`

## Rủi ro và giảm thiểu
- Rủi ro `Current View` không còn mirror tuyệt đối với grid:
  - chấp nhận như một exception rõ ràng cho business requirement `export thêm note`.
- Rủi ro note dài làm sheet khó đọc:
  - tăng width cột, và chỉ thêm wrap text nếu test thực tế ổn định.
- Rủi ro full-data vẫn đi qua fallback cũ không có note:
  - rà lại `LEGACY_COLUMNS` và mọi nhánh default column.
- Rủi ro note nhiều dòng hoặc chứa ký tự đặc biệt:
  - test với text multiline, tiếng Việt, và ô trống.

## Verification
1. Tạo item có `quickNote` và item không có `quickNote`.
2. Export `Current View`:
   - Có cột `Note`
   - Row có note hiện đúng nội dung
   - Row không có note để trống
3. Export `Full Data`:
   - Có cột `Note`
   - Không phụ thuộc filter/show-hide column của UI
4. Test note nhiều dòng để kiểm tra file không lỗi và nội dung không bị mất.
5. Chạy:
   - `npm run lint`
   - `npm run build`

## Tiêu chí hoàn tất
1. Excel sheet `Roadmap` của cả 2 mode đều có cột `Note`.
2. Nội dung cột `Note` khớp với `quickNote` trong dữ liệu.
3. `Summary by Object` và `Weeks` không bị đổi format ngoài ý muốn.
4. Lint/build pass.
