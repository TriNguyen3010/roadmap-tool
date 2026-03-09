# Review: Mở rộng phân loại Feature / Improvement / Bugs / Growth Camp

Đã đọc kỹ bản plan `2026-03-09-1132-worktype-expansion.md`. Nhận thấy có một số điểm khá **bất hợp lý và tiềm ẩn rủi ro lớn về mặt thiết kế cũng như trải nghiệm người dùng**, cụ thể như sau:

### 1. Xung đột ngữ nghĩa ngớ ngẩn (Mâu thuẫn chữ "Feature")
- Hiện tại, kiến trúc roadmap phân cấp theo cấu trúc: `Category` > `Subcategory` > `Group` > **`Feature`** > `Team`. Tức là `type = 'feature'` đang được dùng để chỉ **một cấp bậc (level) trong cây**.
- Nếu plan thêm giá trị `'Feature'` vào `workType` (loại công việc), sẽ sinh ra trường hợp một node có `{ type: 'feature', workType: 'Bug' }`. Về mặt ngữ nghĩa, bắt user gọi một cái lỗi (Bug) là một "Feature" (tính năng) rất tối nghĩa và ngược đời. Nó sẽ làm người dùng cực kỳ lú lẫn.

### 2. Trùng lặp và phân mảnh với `subcategoryType`
- Ở level `Subcategory` hiện tại đã có `subcategoryType` với các options: `Feature`, `Bug`, `Growth Camp`.
- Plan này lại muốn thêm `workType` với các options: `Feature`, `Improvement`, `Bug`, `Growth Camp` ở level thấp hơn (`group` và `feature`).
- Việc tồn tại song song 2 cơ chế phân loại giống hệt nhau ở 2 cấp độ khác nhau sẽ gây rối loạn quy trình lúc nhập liệu *(Ví dụ: User sẽ không biết lúc nào nên đánh dấu cả Subcategory là Bug, lúc nào thì nên tạo Subcategory bình thường rồi đánh dấu các feature bên trong là Bug)*.
- Kế hoạch chưa chốt rõ **có loại bỏ/deprecate `subcategoryType` hay không**, nếu cứ để song song thì filter và báo cáo sẽ rất lằng nhằng.

### 3. Nguy cơ mâu thuẫn phân cấp cha/con (Hierarchy Conflict)
- Theo logic của Plan: *"Cho phép gán loại ở cấp thực thi (ưu tiên `group` và `feature`)"*.
- Chuyện gì xảy ra nếu node cha (`group`) được gán `workType = 'Improvement'` nhưng user lại gán node con bên trong (`feature`) là `workType = 'Bug'`? Sự lẫn lộn này sẽ làm logic bộ Filter bị sai lệch, không biết nên ưu tiên đếm hay lọc theo thằng cha hay thằng con. Plan chưa có rule **kế thừa (inheritance)** hay **validation** để chặn thiết lập trái ngoe này.

### 4. Quá tải giao diện Grid (Cluttered UI)
- Trong `SpreadsheetGrid` phần cấu trúc cây Name, hiển thị cho `group/feature` hiện tại đã gánh rất nhiều thứ: Icon mũi tên Expand, Text tên, icon Quick Note, icon Image Preview. Chưa kể kế bên là các cột Priority badge, Status, Phase tags hiển thị dày đặc.
- Nếu chèn thêm 1 cục badge `workType` (chứa các text dài như `Improvement`, `Growth Camp`) vào layout thì diện tích dòng sẽ bị nhét cứng, dễ bị truncate mất text Name vốn rất quan trọng hoặc gây tràn vỡ bố cục.

---
**💡 Đề xuất để hoàn thiện Plan:**
1. **Giải quyết xung đột từ:** Thay vì đặt tên `workType = 'Feature'`, có thể cân nhắc đổi thành `New` hoặc `Enhancement` để không dẫm chân lên biến `type = 'feature'` của hệ thống. Hoặc mạnh tay hơn là đổi từ khóa `feature` trong cấu trúc Cây hiện tại thành `task` hoặc `item`.
2. **Quy hoạch lại subcategoryType:** Chuyển đổi dứt điểm hoàn toàn (migrate) từ `subcategoryType` xuống áp dụng thành `workType`, bỏ luôn `subcategoryType` cũ để hệ thống chỉ có "1 nguồn sự thật" (Single Source of Truth) cho việc phân loại nghiệp vụ, giúp cho bộ lọc dễ code hơn.
3. **Quy tắc kế thừa rành mạch:** Nếu đã chọn gán `workType` ở `group` thì các `feature` con bên trong **bắt buộc** phải kế thừa tự động (readonly/grayed out), ngăn không cho nhập lệch pha với group cha.
