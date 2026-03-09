# Review: Đổi `feature` (con của `group`) thành `item`

Nhìn chung, plan `2026-03-09-1237-rename-feature-to-item.md` có hướng tiếp cận đúng đắn là đổi tên type để tránh nhầm lẫn giữa cấu trúc cây và loại công việc (Feature vs feature). Các bước phân tách logic (normalize lúc load, đổi component UI, thay string trong code, backward compatibility) rất đầy đủ.

Tuy nhiên, em thấy có một số chỗ anh có thể cân nhắc thêm để logic hoàn chỉnh và bảo mật hơn:

### 1. Rủi ro về hiển thị trên UI (Giao diện người dùng)
- **Tên hiển thị (Label):** Trong `SpreadsheetGrid` hoặc `AddNodePopup`, khi user bấm nút "Thêm con", nếu chữ hiển thị trên nút đổi từ "Thêm feature" thành "Thêm item" thì nghe hơi cụt và mang tính kỹ thuật (item dịch ra mang nghĩa phần tử/vật phẩm).
  - -> **Đề xuất:** Mã nguồn (type và biến) thì đổi thành `item`, nhưng label hiển thị trên UI cho user có thể đổi thành "Task" hoặc "Work Item" để nghe có tính chất nghiệp vụ hơn. Ví dụ nút sẽ là `+ Thêm Task`.

### 2. Thiếu rà soát cấu trúc CSS và Helper styles
- Trong `SpreadsheetGrid`, mảng `DEPTH_STYLES` hoặc các hàm xác định độ lùi vào (indentation) đang phụ thuộc vào `row.type === 'feature'` (ở hàm tính `paddingLeft` dòng 969).
- Tương tự, một số class tailwind hay tooltip có thể đang hardcode chữ `feature`.
  - -> **Cần bổ sung:** Đưa việc kiểm tra các index/hàm liên quan đến tính toán layout (`depth`, `padding`) vào Bước 3 hoặc Bước 5.

### 3. Vấn đề "Nửa mùa" (Mái nhà Feature)
- Nếu mình đổi tên data model từ `feature` sang `item`, điều này giải quyết tốt việc không bị nhầm lẫn bên dưới database. Nhưng ở Bước 1 trong "Kế hoạch triển khai", anh ghi: *Đổi ItemType từ 'feature' -> 'item'.* 
Tuy nhiên, cái cột to tổ chảng trên bảng Roadmap (Left header) nó vẫn đang ghi chữ `FEATURES` (ở dòng 786 file `page.tsx`).
  - -> **Bổ sung:** Bước 3 nên có thêm action đổi tiêu đề cột lưới từ `FEATURES` thành `ITEMS` hoặc `WORK ITEMS` / `TASKS` cho đồng bộ hoàn toàn.

### 4. Thiếu việc Rename các biến State & Functions
- Các state quản lý độ rộng lưới hiện tại mang tên: `featuresColWidth`, `featuresColWidthMode`. Nằm trong API/settings JSON dưới dạng `colFeaturesWidth` và `colFeaturesWidthMode`.
  - -> **Bổ sung:** Plan chưa nhắc đến việc đổi tên các cột này. Dù có thể vẫn xài biến JSON cũ `colFeaturesWidth` cho backward compatibility, tên state trong React `page.tsx` (`featuresColWidth`, `MIN_FEATURES_COL_WIDTH`...) nên được refactor lại thành `itemsColWidth` hoặc `nameColWidth` để code sạch và bớt gây hiểu lầm cho người maintain sau này.

---
**Tóm tắt góp ý:**
Plan nhìn chung rất chặt chẽ về mặt Data. Anh chỉ cần dặn developer lưu ý thêm việc **đồng bộ text hiển thị trên UI** (thay chữ Feature thành Task/Item trên nút và Header cột), **rà soát kĩ logic độ sâu padding**, và **refactor lại tên các biến const/state liên quan Width của cột name** là hoàn hảo ạ.
