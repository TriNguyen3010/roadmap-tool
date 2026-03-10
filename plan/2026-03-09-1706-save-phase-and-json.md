# Plan: Lưu thông tin Phase vào JSON file

## Mục tiêu
- Khi bấm `Save`, phải lưu đầy đủ dữ liệu `Phase`.
- Đồng thời ghi dữ liệu đó vào file `data/roadmap.json`.

## Dữ liệu Phase cần lưu rõ ràng
1. `milestones` (danh sách phase: id, label, startDate, endDate, color).
2. `items[].phaseIds` (phase gán cho từng item/group).
3. `settings.filterPhase` và `settings.colPhase` (trạng thái view liên quan phase).

## Phạm vi
Bao gồm:
1. Save API ghi cloud (Supabase) + ghi file local JSON.
2. Đảm bảo payload save luôn chứa đủ trường phase ở trên.
3. Thêm cảnh báo rõ nếu cloud save ok nhưng ghi file local lỗi.

Không bao gồm:
- Bỏ Supabase.
- Thiết kế backup version nhiều file.

## Kế hoạch triển khai
### Bước 1: Khóa nguồn dữ liệu save
- Dùng `buildDocumentSnapshot` làm nguồn duy nhất để save.
- Soát để chắc chắn snapshot có `milestones`, `items.phaseIds`, `settings.filterPhase`, `settings.colPhase`.

### Bước 2: Ghi file JSON trong API save
- File: `src/app/api/roadmap/save/route.ts`.
- Sau khi save Supabase thành công:
  - `JSON.stringify(data, null, 2)`.
  - ghi `data/roadmap.json.tmp`.
  - rename sang `data/roadmap.json` (atomic write).

### Bước 3: Trả trạng thái save rõ cho UI
- Nếu file write fail nhưng Supabase ok:
  - API trả `success: true` + `warning`.
  - UI hiện toast cảnh báo để biết local file chưa được cập nhật.

### Bước 4: Test theo phase
1. Gán phase cho item -> Save -> kiểm tra `data/roadmap.json` có `phaseIds`.
2. Sửa milestone phase -> Save -> kiểm tra `milestones` trong file.
3. Đổi filter phase/cột phase -> Save -> kiểm tra `settings` trong file.
4. Reload app, import/export JSON round-trip vẫn giữ phase.

### Bước 5: Kiểm tra chất lượng
- `npm run lint`
- `npm run build`

## Rủi ro và giảm thiểu
- Môi trường không cho ghi filesystem:
  - giữ save cloud thành công, trả warning local-file.
- Save liên tục gây ghi đè:
  - dùng atomic write (`tmp` + `rename`).
- Lệch dữ liệu phase giữa state và payload:
  - bắt buộc save từ `buildDocumentSnapshot`.

## Tiêu chí hoàn tất
1. Save xong thấy phase nằm trong `data/roadmap.json`.
2. Cloud save vẫn hoạt động như cũ.
3. Có thông báo rõ khi file local không ghi được.
4. Lint/build pass.
