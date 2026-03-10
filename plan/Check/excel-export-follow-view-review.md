# Review: Xuất Excel theo đúng view hiện tại của user

Đã đọc và phân tích bản plan `2026-03-10-1513-excel-export-follow-current-view.md`. Ý tưởng này cực kì hợp lý vì UX hiện tại đang gây bối rối (user xem trên web một kiểu mà tải file Excel về lại ra toàn bộ data).

Tuy nhiên, về mặt kỹ thuật, em thấy có 2 điểm nóng về kiến trúc code cần lưu ý kĩ để tránh phát sinh lỗi logic và lặp code:

### 1. Kiến trúc tính toán Visible Rows (Tránh lặp code)
- **Vấn đề:** Hiện tại, logic bỏ các dòng bị ẩn bởi `expandedIds` và `hiddenRowIds` đang nằm "chết" bên trong file `SpreadsheetGrid.tsx` dưới dạng các hook `useMemo` (`flattened`, `renderList`). File `page.tsx` không hề biết mảng cuối cùng đang hiển thị ra sao. Nếu anh code Bước 1 (copy luồng tính toán đó ném vào `handleExportExcel` trong `page.tsx`), hệ thống sẽ bị **duplicate logic**. Nghĩa là 1 thuật toán tính dòng hiển thị bị viết ở 2 nơi. Rất rủi ro sau này sửa ở grid mà quên sửa ở export.
- **Đề xuất:**
  - **Cách A:** Refactor đoạn lấy `flattened` ở `SpreadsheetGrid` rút ra thành một hàm helper `getVisibleFlattenedRows(data, expandedIds, hiddenRowIds)` vứt vào file `roadmapHelpers.ts`. Sau đó cả component `SpreadsheetGrid` và `handleExportExcel` đều tái sử dụng chung hàm này để lấy kết quả. 
  - **Cách B:** Nâng hẳn cái state mảng phẳng 1 chiều đó lên quản lý tại `page.tsx` luôn, sau đó truyền vào grid làm props. (Cách này có thể hơi nặng cho React tree, ưu tiên Cách A).

### 2. Sửa hàm Export đệ quy
- **Vấn đề:** Hàm `exportRoadmapToExcel` ở file `src/utils/exportToExcel.ts` hiện tại được viết dựa trên việc lấy toàn bộ cục `RoadmapDocument` (dạng cây) rồi chạy hàm đệ quy (recursive `walk`) để in ra từng dòng theo thứ tự cha con.
- **Lưu ý triển khai:** Ở Bước 2 của plan, khi truyền một mảng `rows` 1 chiều (flattened) vào hàm export, anh phải sửa lại logic xuất file. Thay vì gọi hàm `walk(item.children)`, thuật toán chỉ cần lặp thẳng trơn qua array `rows` là đủ. Thụt lề (Indent) của tên sẽ dựa trực tiếp vào thuộc tính `row.parentIds.length` có sẵn trên row phẳng.

### 3. Gap Row Handling (Dòng khoảng trống)
- Khi dùng `hiddenRowIds` trên UI, code hiện tại biến các dòng bị ẩn thành 1 dòng khoảng trống "gap" (Ví dụ: `Hidden (3) tasks`).
- Khi xuất ra Excel, anh nên loại bỏ hoàn toàn các gap row này, chỉ in ra data thật. (Tức là chỉ xuất tập `flattened` lọc những ID bị tắt, không cần xuất cục `renderList`).

---
**Tóm tắt:** Ý tưởng chốt sổ rất hay và tăng giá trị tool lên rất nhiều. Dev chỉ cần cảnh giác lúc bóc tách cái thuật toán `Mảng 1 chiều hiển thị` ra xài chung để **tránh Duplicate Code**, đồng thời sửa lại thuật toán xuất Excel không dùng đệ quy nữa khi truyền mảng thẳng vào là được c ạ.
