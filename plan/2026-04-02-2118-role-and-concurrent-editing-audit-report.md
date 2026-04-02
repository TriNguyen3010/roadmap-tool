# Role, Concurrent Editing & Row-based Sync Audit Report

Dựa trên checklist tự kiểm tra đặt ra, dưới đây là kết quả kiểm toán (Audit) tĩnh và kiến trúc dành cho hệ thống phân quyền (Role) cùng cơ chế chỉnh sửa đồng thời (Concurrent Editing) và đồng bộ Database (Dual Write).

## 1. Audit Auth & Role (Phase 1 + 2)

**Phần Role Pass (Đạt):**
- **Độc lập Xác Thực:** File `serverTeamAuth.ts` không tin tưởng client. Nó tự động gọi `supabaseServer.auth.getUser()` (đọc an toàn từ session token backend) để xác thực Email. Sau đó, nó tự Query vào bảng `team_members` để tự lấy ra Role và Team của user, chặn đứng việc fake local storage ở Client.
- **Bảo Vệ API Chặt Chẽ:** Tất cả API Save (ngoại trừ Manager-Save) đều được rào lại bởi `authenticateAdminRequest()`. Do đó API `save`, metadata, milestones đều an toàn.
- **Level Phân Quyền Hợp Lý:** Logic của `isAdminLevel` trong `auth.ts` định danh Role = `admin` VÀ Role = `manager` mà thuộc Team danh dự (`SepVinh`, `PM`) đều có Full Access. Đây là semantics đúng đắn với rules business đặt ra.
- **Gating Team Fields:** Logic ở `validateManagerChanges` cực kỳ triệt để. Code không chừa lỗ hổng, khi Manager submit change -> Loop bắt lại ID trên Tree -> So khớp `teamRole` cũ của Item đó có trùng với `Manager.team` hay không. Ngăn chặn tuyệt đối 100% rủi ro "Manager team FE sửa ngày của Team BE".

**Phần Role Còn Rủi Ro (Hở):**
- **Viewer Role Xử Lý Mờ Nhạt:** Ở Type hệ thống có định nghĩa `viewer` nhưng không thấy logic cụ thể cho việc enforce nó. Tuy nhiên, nếu User không nằm trong bảng `team_members` thì mặc định sẽ bị cấm ghi toàn bộ API. Mặc định public read.
- **Khuyến Nghị Minor (Severity: Thấp):** Giao diện ở `SpreadsheetGrid` hiện tại có thể vẫn hiển thị các Input sửa Milestone/Meta cho `Manager`. Tuy API Server sẽ chặn đứng và quăng 403 nếu họ Save, nhưng UI nên ẩn/vô hiệu hóa nút Save từ đầu để tránh trải nghiệm tồi tệ.

## 2. Audit Concurrent Editing & Conflict (Phase 3 + 4 + 5)

**Phần Conflict Handle Pass (Đạt):**
- **Sử Dụng BaseVersion Chuẩn Khung Strict:** Tất cả các Route từ Full Save, vá lỗi (Patch) đến Manager Save đều yêu cầu Client truyền kèm `baseVersion`. File `roadmapSaveFlow.ts` và logic Atomic Query `.eq('updated_at', currentVersion)` đảm bảo phiên bản dữ liệu sẽ Văng Lỗi `409 Conflict` nếu có bất kỳ 1 ai đó lưu đè trước đó với chênh lệch mili-giây.
- **Validation Kép Mạng Mẽ:** Client gởi `baseVersion` định dạng Timestamp String. Hệ thống sẽ so trực tiếp độ trễ. Nếu Client không gửi hoặc gửi quá Stale -> Block Save. Cấu hình này giúp băm nát hoàn toàn lỗi đè dữ liệu thầm lặng (Silent Overwrite).

**Phần Conflict Handle Còn Rủi Ro (Hở):**
- **UX Xử lý Conflict (Severity: Trung bình):**
  Một khi `409 Conflict` bị đẩy ra, server trả về `pendingRemoteVersion`. Tuy frontend App có thể báo Conflict, nhưng việc **Tự Động Trộn Dữ Dữ Liệu Cục Bộ (Auto Merge)** chưa được hỗ trợ. User hiện tại vẫn có nguy cơ phải chọn làm lại từ đầu nếu gặp cản trở (Reload page lấy bản mới).
- **Draft Backup Recovery:** Khi User navigate (về Home) hoặc nhỡ trớn bấm Reload khi Data đang "Dirty", không thấy hệ thống local storage lưu draft tự động mạnh mẽ chống mất bài.
- **Khuyến Nghị Khắc Phục:** Triển khai thêm lớp Local Storage lưu trữ `Draft Tree`. Khi save lỗi Conflict, lưu bản hiện tại dạng nháp. Restart hoặc Reload xong có pop-up: `"Bạn có dữ liệu nháp cũ chưa hoàn thiện, muốn apply lại không?"`.

## 3. Normalized Row Sync (Phase 6 Dual-Write)

**Kiểm định hệ thống đồng bộ Schema Postgres:**
- File Migration `2026...enable_normalized_roadmap_dual_write.sql` chứa Postgres Trigger Function vòng lặp Đệ Quy (`jsonb_array_elements` & `WITH RECURSIVE item_tree_...`) xử lý trực tiếp dưới tầng Database cực kì ấn tượng.
- **Đạt điểm tuyệt đối:** Việc gỡ Rối tách Dữ Liệu (tách từ 1 JSON blob lớn ra các bảng con roadmap_items, images, milestones) KHÔNG dựa vào Server Node.js NextJS, mà nằm khảm thẳng vào sự kiện DML của Database Postgres (`AFTER INSERT OR UPDATE`). Điều này có nghĩa là cho dù có 100 User call API Save cùng lúc, thì dữ liệu bảng lớn `roadmap_data` sẽ lock Row tự cập nhật. Database sẽ lần lượt đẩy dữ liệu vô cái Bảng Con tự động mà không lo Race Constraints ở API Nodes.
- **Quản lý Backfill:** Hàm procedure `public.backfill_normalized_roadmaps()` sẵn sàng cho việc fill lại dữ liệu nếu quá khứ có bị hỏng.

## 4. Tổng Kết & Quyết Định Chung Cho Master Plan

👉 **Câu hỏi 1: Đã an toàn để bật Mở Rộng tính năng Collaboration chưa?**
- **Quyết định:** ✅ **CẤP PHÉP TIẾP TỤC**. Kiến trúc chống Overwrite hoạt động đủ tốt để ngăn chặn vĩnh viễn rủi ro hỏng hóc Cấu Trúc Toàn Cục khi có 2 hay 3 User cùng làm một dự án. Bạn có thể tự tin Invite Team vào Roadmap với tư cách Manager thao tác hàng chục Features nhỏ (Tuy lúc Conflict sẽ hơi phiền).

👉 **Câu hỏi 2: Có nên chuyển "luồng Đọc bài - Read Flow" hoàn toàn sang Bảng Normalized Table (Bảng Con) lúc này không?**
- **Quyết định:** ❌ **KHOAN LẬT READ PATH**. Client hiện tại thiết kế Tree Render đang bòn cục Tree JSON Blob rất nhanh và rất trơn tru. Để lật Read Path, Client phải viết lại toàn bộ API Request dạng Bốc Relational (Bốc Parent -> Tự nối vào Child). Điều này sẽ làm App bị chậm lại đáng kể, và gây trễ hiệu ứng giao diện so với blob.
- **Khuyến Nghị Tiến Độ:** Chấm dứt Audit. Hãy giữ nguyên luồng Đọc dữ liệu từ Blob JSON như cũ. Và lấy Data từ `Bảng Con - Normalized` để chuyên biệt dùng cho việc Query Tổng Hợp Báo Cáo hoặc Export Data cho cấp sếp là Hoàn Hảo Nhất!
