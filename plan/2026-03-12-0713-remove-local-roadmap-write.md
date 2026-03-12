# Plan: Bỏ bước lưu local file `data/roadmap.json`

## Mục tiêu
- Loại bỏ hoàn toàn bước ghi local file khi save roadmap.
- Dùng cloud (Supabase) làm source of truth duy nhất.
- Tránh cảnh báo gây hiểu nhầm trên production.

## Lý do
- Môi trường production/serverless thường không đảm bảo ghi được filesystem local.
- Save cloud đã thành công nhưng local write fail làm UI hiển thị warning không cần thiết.
- Local file hiện không còn cần cho luồng vận hành chính.

## Phạm vi thay đổi
1. `src/app/api/roadmap/save/route.ts`
- Bỏ `writeRoadmapToLocalFile`.
- Bỏ `LOCAL_DATA_DIR`, `LOCAL_ROADMAP_FILE`, `LOCAL_ROADMAP_TMP_FILE`, `fs`, `path` liên quan.
- Bỏ `fileWarning` trong response.
- Response thành công chỉ còn `{ success: true }` khi upsert Supabase OK.

2. `src/app/page.tsx`
- Rút gọn logic toast save:
  - Thành công: một message duy nhất `Đã lưu thành công.`
  - Không còn xử lý `payload.fileWarning`.

3. `README.md` (nếu có đề cập local backup)
- Cập nhật mô tả: production dùng cloud-only.

## Kế hoạch triển khai
### Phase 1 - API cleanup
1. Gỡ hoàn toàn local write trong route save.
2. Giữ nguyên kiểm tra editor session và error handling cho Supabase.

### Phase 2 - UI message cleanup
1. Cập nhật toast save để không còn nhánh warning local file.
2. Đảm bảo người dùng chỉ thấy fail khi cloud save fail thật.

### Phase 3 - Verify
1. Save thành công: chỉ hiện 1 toast success.
2. Save fail Supabase: hiện toast error như hiện tại.
3. `npm run lint` và `npm run build` pass.

## Acceptance criteria
1. Không còn code ghi `data/roadmap.json` trong API save.
2. Không còn message `không thể cập nhật file data/roadmap.json`.
3. Save flow rõ ràng: success/fail theo cloud save.

## Rủi ro & lưu ý
- Mất kênh backup local file trong production.
- Nếu vẫn cần backup, nên làm backup cloud/object storage riêng thay vì filesystem cục bộ.
