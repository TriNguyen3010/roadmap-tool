# Plan: Fix lỗi không unlock được Editor trên Production

## Mục tiêu
- Xác định chính xác nguyên nhân vì sao production không vào được Editor mode.
- Khôi phục khả năng unlock ổn định trên production.
- Bổ sung kiểm tra để tránh tái diễn sau deploy.

## Triệu chứng hiện tại
- Trên local, password `88999898` unlock được.
- Trên production, cùng password không unlock được.

## Giả thuyết nguyên nhân ưu tiên
1. `EDITOR_PASSWORD` trên production khác giá trị mong muốn.
2. Biến môi trường đã đổi nhưng chưa redeploy/restart.
3. Login API trả `200` nhưng cookie session không được lưu (secure cookie/domain/proxy).
4. `EDITOR_SESSION_SECRET` thay đổi không đồng bộ khiến session check fail.
5. Request body có khoảng trắng/ký tự thừa do nhập từ UI.

## Phạm vi
Bao gồm:
1. Kiểm tra API login/session trên production.
2. Kiểm tra env config production (`EDITOR_PASSWORD`, `EDITOR_SESSION_SECRET`, `NODE_ENV`).
3. Sửa code nếu cần để tăng độ chịu lỗi và khả năng quan sát.

Không bao gồm:
- Thay đổi cơ chế auth sang provider khác.

## Kế hoạch triển khai
### Bước 1: Khoanh vùng bằng network production
1. Mở DevTools production, submit unlock.
2. Kiểm tra `POST /api/auth/editor/login`:
- status code, response body.
- có `Set-Cookie: roadmap_editor_session` hay không.
3. Gọi `GET /api/auth/editor/session` ngay sau login để xác nhận server thấy session.

### Bước 2: Kiểm tra cấu hình production
1. Xác nhận giá trị `EDITOR_PASSWORD` trong môi trường deploy.
2. Xác nhận `EDITOR_SESSION_SECRET` ổn định (không đổi ngẫu nhiên giữa lần deploy).
3. Redeploy sau khi cập nhật env (nếu platform yêu cầu).

### Bước 3: Hardening code auth
1. Trim password ở server trước khi validate:
- `const password = (body.password || '').trim()`.
2. Giữ log server-side an toàn:
- log reason theo mã lỗi, không log password raw.
3. Nếu login fail, trả lỗi rõ để phân biệt:
- `invalid_password` vs `session_cookie_not_set` (nếu phát hiện được).

### Bước 4: Kiểm tra cookie/session
1. Xác nhận cookie options hợp lệ production:
- `secure: true` khi HTTPS.
- `sameSite: 'lax'`, `path: '/'`.
2. Nếu có nhiều domain/subdomain, xác nhận cookie domain không bị lệch.

### Bước 5: Regression check
1. Test unlock trên production sau fix.
2. Test lock/logout rồi unlock lại.
3. Test refresh trang vẫn giữ Editor mode khi session còn hạn.

## Rủi ro và giảm thiểu
- Rủi ro lộ thông tin nhạy cảm qua log:
  - Chỉ log mã lỗi/metadata, không log password.
- Rủi ro fix local ok nhưng production fail do config:
  - Ưu tiên kiểm tra env + redeploy trước khi refactor sâu.

## Tiêu chí hoàn tất
1. Unlock Editor hoạt động trên production với password chuẩn.
2. `POST /api/auth/editor/login` trả thành công và `session` endpoint phản ánh đúng trạng thái.
3. Có checklist deploy/env rõ ràng để tránh lỗi lặp lại.
