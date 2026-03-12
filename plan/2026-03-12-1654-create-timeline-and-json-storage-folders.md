# Plan: Tạo 2 folder trong project cho Timeline export và JSON save

## Mục tiêu
1. Có thư mục cố định trong project để lưu file export Timeline.
2. Có thư mục cố định trong project để lưu file JSON backup.

## Lưu ý kỹ thuật quan trọng
- Browser download (`a.download`, `showSaveFilePicker`) **không thể** ép đường dẫn lưu vào folder trong project.
- Muốn file chắc chắn đi vào folder trong project, cần lưu file ở **server-side** (Node runtime) qua API.

## Đề xuất cấu trúc folder
1. `storage/timeline-exports/`
2. `storage/json-backups/`

## Scope thay đổi
1. Tạo folder vật lý trong repo:
- `storage/timeline-exports/.gitkeep`
- `storage/json-backups/.gitkeep`
2. Thêm helper resolve path + ensure directory tồn tại.
3. Tách logic export timeline để chạy được trên server (không phụ thuộc `window`).
4. Thêm API ghi file:
- `POST /api/export/timeline` -> tạo file `.xlsx` trong `storage/timeline-exports`
- `POST /api/export/json-backup` -> tạo file `.json` trong `storage/json-backups`
5. UI gọi API thay vì chỉ download trực tiếp từ browser.

## Phase 1 - Foundation folder + config
1. Tạo 2 folder `storage/timeline-exports`, `storage/json-backups`.
2. Thêm env optional:
- `TIMELINE_EXPORT_DIR` (default: `storage/timeline-exports`)
- `JSON_BACKUP_DIR` (default: `storage/json-backups`)
3. Thêm util chuẩn hóa path (chặn path traversal).

## Phase 2 - Timeline export vào folder server
1. Refactor util excel thành 2 phần:
- phần build workbook data (pure, dùng được cả client/server),
- phần save browser (giữ cho fallback nếu cần).
2. Tạo route `POST /api/export/timeline`:
- nhận payload export mode + filters/rows cần export,
- sinh file `.xlsx`,
- ghi vào `storage/timeline-exports`,
- trả metadata: `fileName`, `relativePath`, `createdAt`.
3. UI đổi nút export để gọi API và toast:
- `Đã lưu timeline export vào storage/timeline-exports/...`

## Phase 3 - JSON save vào folder server
1. Tạo route `POST /api/export/json-backup`:
- nhận snapshot JSON,
- ghi file `.json` vào `storage/json-backups`.
2. Luồng `Download JSON` đổi thành:
- Save vào folder server trước,
- (tuỳ chọn) vẫn cho download local browser nếu user muốn.
3. Toast hiển thị đường dẫn file đã lưu trong project.

## Phase 4 - QA
1. Bấm export timeline -> có file mới trong `storage/timeline-exports`.
2. Bấm JSON backup -> có file mới trong `storage/json-backups`.
3. Tên file có timestamp, không ghi đè file cũ.
4. Lỗi quyền ghi thư mục -> thông báo rõ ràng.
5. Không ảnh hưởng save cloud hiện tại.

## Rủi ro và cách xử lý
1. Runtime serverless/read-only FS:
- Nếu deploy không cho ghi local disk, cần fallback sang object storage (Supabase Storage/S3).
2. File tăng nhiều:
- Thêm policy dọn file cũ theo ngày hoặc số lượng ở phase sau.

## Kết quả mong đợi
1. File timeline export luôn nằm trong folder timeline trong project.
2. File JSON backup luôn nằm trong folder JSON backup trong project.
3. User không còn phụ thuộc vị trí download mặc định của browser.
