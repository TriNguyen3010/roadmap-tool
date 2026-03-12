# Plan: Làm rõ cảnh báo save cloud/local và đổi message

## Vấn đề
- UI đang hiện đồng thời:
  - `Đã lưu thành công lên cloud.`
  - `Đã lưu cloud thành công nhưng không thể cập nhật file data/roadmap.json.`
- Người dùng hiểu đây là lỗi nghiêm trọng, dù dữ liệu cloud đã lưu thành công.

## Nguyên nhân gốc
1. API save luôn lưu lên Supabase trước.
2. Sau đó API cố ghi thêm file local `data/roadmap.json`.
3. Trên production (đặc biệt serverless/readonly filesystem), bước ghi local có thể fail.
4. Khi fail local, server trả `fileWarning`, client đang hiển thị thông báo dạng “cảnh báo lỗi”.

## Mục tiêu
- Giữ đúng trạng thái kỹ thuật: cloud save thành công là thành công.
- Chỉ coi local file là kênh backup phụ.
- Đổi message để người dùng không hiểu nhầm “save bị lỗi”.

## Hướng xử lý đề xuất
### Option A (khuyến nghị): Cloud-first message + local note nhẹ
1. Nếu cloud save thành công, luôn hiện toast success duy nhất:
- `Đã lưu thành công.`
2. Nếu local write fail, hiện note info trung tính:
- `Không cập nhật file local data/roadmap.json (không ảnh hưởng dữ liệu cloud).`
3. Đổi severity từ cảnh báo gây hiểu nhầm sang info.

### Option B: Bật/tắt local write theo env
1. Thêm env `LOCAL_JSON_WRITE_ENABLED`:
- `true` ở local/dev
- `false` ở production cloud-only
2. Nếu disabled thì bỏ qua hẳn bước write local và không trả `fileWarning`.

## Phạm vi code
1. `src/app/api/roadmap/save/route.ts`
- Chuẩn hóa response:
  - `success: true`
  - `localFileUpdated: boolean`
  - `localFileMessage?: string`

2. `src/app/page.tsx`
- Chuẩn hóa toast:
  - success chính luôn là save cloud thành công.
  - info phụ chỉ để giải thích local backup, wording trung tính.

3. (Tùy chọn) `.env.example` + README
- Document rõ local JSON write là optional ở production.

## Kế hoạch triển khai
### Phase 1 - Clarify response contract
1. Đổi `fileWarning` thành metadata rõ nghĩa (`localFileUpdated`, `localFileMessage`).
2. Không đổi status HTTP khi cloud save thành công.

### Phase 2 - Update UI message
1. Toast success chính: `Đã lưu thành công.`
2. Toast info phụ (nếu có): `Không cập nhật file local... (không ảnh hưởng dữ liệu cloud).`

### Phase 3 - Optional env gate
1. Thêm `LOCAL_JSON_WRITE_ENABLED`.
2. Mặc định production đặt `false` nếu không cần local file backup.

## Acceptance criteria
1. Người dùng chỉ thấy save fail khi cloud save fail thật.
2. Cảnh báo local file không gây hiểu nhầm mất dữ liệu.
3. Log server vẫn giữ đủ thông tin debug cho local write fail.

## Ghi chú vận hành
- Với kiến trúc hiện tại, cloud (Supabase) mới là source of truth.
- `data/roadmap.json` trên production chỉ nên coi là backup phụ hoặc chỉ dùng trong local/dev.
