# Plan: Lưu dữ liệu trực tiếp vào file JSON

## Mục tiêu
- Khi user bấm `Save`, dữ liệu không chỉ lên Supabase mà còn được ghi vào file JSON trong project.
- File JSON dùng làm bản backup local để khôi phục nhanh khi cần.

## Hiện trạng
- Luồng save hiện tại ghi vào Supabase (`roadmap_data.content`) qua API `POST /api/roadmap/save`.
- File `data/roadmap.json` hiện không phải nguồn persistence runtime chính.

## Phạm vi
Bao gồm:
1. Ghi thêm dữ liệu save vào file JSON local (`data/roadmap.json`).
2. Giữ nguyên luồng Supabase hiện tại để không phá behavior đang chạy.
3. Thêm xử lý lỗi rõ ràng nếu môi trường không cho ghi file.

Không bao gồm:
- Bỏ Supabase hoàn toàn (chưa làm ở vòng này).
- Thiết kế versioning nhiều file backup.

## Kế hoạch triển khai
### Bước 1: Mở rộng API save để ghi file
- File: `src/app/api/roadmap/save/route.ts`
- Sau khi validate session và parse body:
  1. Serialize JSON với indent (`JSON.stringify(data, null, 2)`).
  2. Ghi ra file tạm `data/roadmap.json.tmp`.
  3. Rename đè sang `data/roadmap.json` (atomic write).

### Bước 2: Chiến lược đồng bộ Supabase + file
- Đề xuất mặc định:
  - Save Supabase trước.
  - Nếu Supabase thành công thì ghi file JSON.
- Nếu ghi file lỗi:
  - Trả về warning trong response để UI biết “đã lưu cloud nhưng chưa lưu file local”.

### Bước 3: Cập nhật phản hồi UI
- File: `src/app/page.tsx`
- Khi gọi save:
  - Nếu API trả warning về file-write, hiển thị toast cảnh báo.
  - Nếu cả 2 thành công, giữ toast success như hiện tại.

### Bước 4: Rà môi trường chạy
- Xác nhận runtime route đang là `nodejs` để dùng `fs/promises`.
- Ghi chú rủi ro:
  - Một số môi trường deploy serverless/read-only filesystem sẽ không ghi được file.
  - Local/dev và self-host có quyền ghi sẽ hoạt động bình thường.

### Bước 5: Test
1. Save thành công -> `data/roadmap.json` cập nhật timestamp/nội dung mới.
2. Reload app -> dữ liệu vẫn đúng từ Supabase.
3. Giả lập lỗi ghi file -> API trả warning, UI hiển thị cảnh báo đúng.
4. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro race condition khi save liên tiếp:
  - Giảm thiểu: atomic write (tmp + rename).
- Rủi ro quyền ghi file không có:
  - Giảm thiểu: không làm fail toàn bộ save cloud; trả warning rõ.
- Rủi ro lệch dữ liệu giữa cloud và file:
  - Giảm thiểu: luôn ghi file từ đúng payload vừa save cloud.

## Tiêu chí hoàn tất
1. Bấm Save sẽ cập nhật `data/roadmap.json`.
2. Không làm hỏng luồng save Supabase hiện tại.
3. Có thông báo rõ khi không ghi được file.
4. Lint/build pass.
