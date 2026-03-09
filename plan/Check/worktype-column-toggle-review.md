# Review: WorkType thành cột riêng + hide/show

Đã đọc bản plan `2026-03-09-1315-worktype-column-toggle.md`. Plan có cấu trúc logic rõ ràng về việc tách hiển thị `groupItemType` thành một cột riêng (cột `WorkType`).

Tuy nhiên em thấy có vài điểm cần làm rõ/sung thêm để tránh thiếu sót khi code:

### 1. Hành vi của Badge trong Name khi tắt cột WorkType
- Plan ghi: *"Khi cột WorkType bật, bỏ badge groupItemType khỏi cột Name để tránh duplicate"*.
  - -> **Câu hỏi đặt ra:** Vậy khi cột `WorkType` bị **tắt (hide)** thì cái badge đó có được render lại vào cột Name không?
  - -> **Góp ý:** Để code UI đơn giản và tránh tính toán auto-width phức tạp: Nên **xóa vĩnh viễn** badge `groupItemType` khỏi cột Name trong mọi trường hợp (dù bật hay tắt cột riêng). Nếu user tắt cột `WorkType` thì coi như họ chấp nhận không xem thông tin nhánh này trên màn hình.

### 2. Thiếu cập nhật Export Excel
- Trong hệ thống Roadmap tool, hiện đang có tính năng xuất Excel (`exportToExcel.ts`).
- Nếu giao diện web có thêm cột `WorkType` riêng, trên Excel xuất ra cũng nên có một cột `Work Type` tương ứng để user lọc/tìm kiếm ngoại tuyến.
  - -> **Bổ sung:** Bước 3 hoặc Bước 5 nên thêm việc cập nhật hàm export file `exportToExcel.ts` để thêm cột Header và Data mapping cho `WorkType`.

### 3. Vị trí hiển thị của cột WorkType mới
- Bảng Grid hiện tại đang có thứ tự `[ID] | [NAME] | [PRIORITY] | [STATUS] | [PHASE] | [START] | [END] | [ACTIONS]`.
- Plan chưa chỉ định rõ cột `WorkType` sẽ nằm ở đâu.
  - -> **Bổ sung:** Cần quy định rõ vị trí của cột này. Theo logic thông thường, loại công việc (`WorkType`) thường đi liền với cột `NAME` hoặc `PRIORITY`. Hợp lý nhất là chèn vào giữa `NAME` và `PRIORITY` hoặc sau `PRIORITY`.

### 4. Đồng bộ State width
- Cần chú ý trong hàm tính toán `totalLeftW` (độ rộng khung bên trái) phải cộng thêm `(showWorkType ? COL_WORK_TYPE_W : 0)`.
- Các nút Restore (hiện cột) ở cột `ACTIONS` cần nhét thêm nút mồi "Hiển thị WorkType" (chữ W) nếu user lỡ tay tắt nó đi. (Plan đã có nhắc ở Bước 3, cần chú ý implement cẩn thận).

---
**Tóm tắt:** Plan cơ bản đã ổn. Anh chỉ cần cập nhật thêm vụ **Export Excel**, chốt **vị trí đặt cột WorkType**, và thống nhất là **bỏ hẳn badge ở cột Name** luôn (đỡ logic tính width) là perfect ạ.
