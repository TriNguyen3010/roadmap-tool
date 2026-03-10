# Review: Đề xuất format report (ID thứ tự, Tên tính năng, Group)

Đã tham khảo qua plan `2026-03-10-1539-report-format-id-feature-group.md`. Ý tưởng thống nhất 1 chuẩn báo cáo 3 cột (ID, Tên tính năng, Group) chia theo block (App, Web, Team PD) để bỏ vào Sheet Summary khi xuất Excel là rất thiết thực và chuyên nghiệp.

Về mặt kỹ thuật khi code, em lưu ý anh vài điểm quan trọng sau để team Dev không bị vấp:

### 1. Phân loại Block (App / Web / Team PD)
- Trong dữ liệu hiện tại (file `page.tsx` hay `exportToExcel.ts`), hệ thống đang **KHÔNG** hề có thuộc tính nào tên là `block = 'App'` hay `block = 'Web'`. 
- -> **Lưu ý triển khai:** Dev sẽ phải hardcode kiểm tra chuỗi (Ví dụ: `if (row.parentNames.includes('App'))`) hoặc dựa vào ID cố định của Category để gom nhóm các dòng vào đúng Block. Cần chốt rõ với Dev quy tắc nhận diện Item thuộc block nào trước khi bắt tay code.

### 2. Thuật toán tìm `Group` (Ancestor)
- Plan: *"Ưu tiên lấy từ ancestor `group` gần nhất của item"*.
- Trong cái mảng 1 chiều (flatten array) mà hàm export nhận được, để tìm cha của một item, ta có sẵn cái mảng `parentIds`. Tuy nhiên, node cha đó có phải là `group` hay không thì ta phải tra ngược lại trong mảng toàn cục. 
- -> **Lưu ý triển khai:** Dev cần chuẩn bị 1 helper `findGroupAncestor(item, allItems)` dùng vòng lặp dò ngược cái mảng `parentIds` từ chiều sâu về tới gốc, dò trúng node nào có `type === 'group'` thì return Name của node đó. Fallback về `'—'` nếu lọt lên tới gốc mà không thấy.

### 3. Cấu trúc Sheet Excel Mới
- Hiện tại tool chỉ đang xuất 2 sheet: `Roadmap` và `Milestones`. Tool của mình chưa hề có `Sheet Summary`.
- -> **Bổ sung:** Để ghi nhiều bảng (blocks) vào chung 1 sheet theo chiều dọc (Dòng tiêu đề -> Header -> Rows -> Dòng trống -> Dòng tiêu đề 2...), dev thao tác trên `XLSX` sẽ không thể dùng hàm `aoa_to_sheet` đơn giản một phát ăn ngay. Cần nối các mảng Array 2D của từng block lại với nhau thành 1 mảng dọc siêu to rồi mới parse ra Sheet, sau đó mới gắn style bôi đậm (bold) cho các dòng Title.

---
**Tóm tắt:** Plan Rất tốt về mặt UI/Business. Tuy nhiên ở mặt Technical, Dev cần chú ý vụ **nhận diện Block bằng tay** và viết **thuật toán mò ngược tìm cha (Group)** cho rạch ròi. Anh cân nhắc cập nhật thêm quy tắc nhận diện Block (App/Web/PD) vào Bước 1 hoặc Nhắc nhở cho Dev trước khi code là duyệt!
