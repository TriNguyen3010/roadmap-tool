# Investigation Result: Reported data loss after save (Root Cause Only)

## Kết luận ngắn
Nguyên nhân có xác suất cao nhất là **stale overwrite do nhiều request save chạy song song (race condition, last write wins)**.

## Bằng chứng chính
1. Client có nhiều điểm autosave gọi liên tiếp
- Reported viewer đổi `Status`/`Phase` gọi save ngay mỗi click.
- Nguồn gọi autosave tiêu biểu:
  - `src/components/SpreadsheetGrid.tsx:2538`
  - `src/components/SpreadsheetGrid.tsx:2600`
  - `src/components/SpreadsheetGrid.tsx:2626`
  - `src/components/SpreadsheetGrid.tsx:1012`
  - `src/components/SpreadsheetGrid.tsx:1127`

2. `handleDataChange` gọi `handleSave` mà không await/queue
- `src/app/page.tsx:624-630`
- Mỗi lần `shouldSave=true` sẽ bắn request save mới ngay cả khi request trước chưa xong.

3. Server save là upsert full document, không có version guard
- `src/app/api/roadmap/save/route.ts:18-23`
- Không có check `updated_at` cũ/mới từ client, không có optimistic concurrency.
- Vì vậy request snapshot cũ nếu về sau có thể đè snapshot mới.

4. Không thấy dấu hiệu normalize tự làm rớt Reported trong dữ liệu hiện tại
- Rule normalize priority chỉ giữ `High|Medium|Low|Reported|Sếp Vinh`.
- Kiểm tra dữ liệu hiện tại cho thấy trước/sau normalize count `Reported` không đổi (19 -> 19).
- Điều này giảm khả năng “mất dữ liệu do normalize” với dataset hiện tại.

## Timeline kỹ thuật khả dĩ gây mất dữ liệu
1. Request A gửi với snapshot cũ.
2. User thao tác tiếp, request B gửi với snapshot mới.
3. B hoàn thành trước -> cloud có dữ liệu mới.
4. A hoàn thành sau -> upsert đè lại dữ liệu cũ.
5. Hệ quả: một phần dữ liệu (ví dụ priority Reported mới chỉnh) biến mất.

## Nhận định mức độ chắc chắn
- **Cao** cho giả thuyết race overwrite (có full bằng chứng cấu trúc code).
- **Trung bình-thấp** cho giả thuyết normalize rớt dữ liệu (không thấy trên dataset hiện tại).

## Phạm vi báo cáo
- Báo cáo này chỉ xác định nguyên nhân, **không bao gồm fix code**.
