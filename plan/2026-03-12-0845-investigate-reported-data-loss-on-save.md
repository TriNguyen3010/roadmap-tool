# Plan: Điều tra mất dữ liệu Reported trong quá trình Save

## Mục tiêu
- Xác định nguyên nhân gốc vì sao dữ liệu `Reported` bị mất sau khi save.
- Khoanh vùng chính xác ở tầng nào: UI state, normalize, API save, hay overwrite từ request cũ.
- Đưa ra fix có thể rollback-safe, tránh mất dữ liệu lần nữa.

## Hiện trạng ghi nhận
- Triệu chứng: sau save, các item `Priority = Reported` bị mất (hoặc giảm mạnh) theo phản ánh user.
- Baseline từ file local hiện có (`data/roadmap.json`, chỉ dùng làm tham chiếu):
  - Reported total: `19`
  - Có ảnh: `18`
  - Thiếu ảnh: `1`
  - Type: toàn bộ là `group`

## Giả thuyết nguyên nhân (ưu tiên)
1. **Overwrite toàn bộ document bởi snapshot cũ (race condition)**
- Save API đang `upsert` toàn bộ `content` mỗi lần save.
- Nếu có nhiều request save gần nhau, request cũ về sau có thể đè request mới.

2. **Client gửi payload không đầy đủ ở 1 nhánh update**
- Một số action có thể save với state chưa đồng bộ đầy đủ (`onDataChange` + autosave liên tiếp).

3. **Normalize làm rớt priority ngoài tập chuẩn**
- `normalizeItemPriority` chỉ giữ `High|Medium|Low|Reported|Sếp Vinh`.
- Dữ liệu priority lệch format (space/case/label khác) có thể bị map thành `undefined` khi load/save.

4. **Ghi đè từ client/session khác**
- Không có optimistic concurrency check theo version tại API save.
- Tab/phiên khác có thể save snapshot cũ và đè dữ liệu.

## Phạm vi điều tra
1. `src/app/page.tsx`
- `handleDataChange`, `handleSave`, luồng autosave.
2. `src/components/SpreadsheetGrid.tsx`
- Các điểm gọi `onDataChange(..., true)` trong Reported/inline editing.
3. `src/types/roadmap.ts`
- Normalize priority/status ảnh hưởng tính toàn vẹn dữ liệu.
4. `src/app/api/roadmap/save/route.ts`
- Upsert full document, thiếu guard version.

## Kế hoạch điều tra
### Phase 1 - Reproduce có kiểm soát
1. Tạo snapshot trước save (JSON A), thao tác trong Reported mode, save, lấy JSON B.
2. Diff A/B tập item `priority = Reported` theo ID để xem item nào biến mất.
3. Ghi lại thứ tự thao tác chính xác gây mất dữ liệu.

### Phase 2 - Instrumentation tạm thời
1. Log metadata trong save request/response (không log dữ liệu nhạy cảm):
- `reportedCount`, `itemCount`, `requestId`, `clientTimestamp`.
2. Log metadata ở server trước khi upsert.
3. So sánh request nào ghi cuối cùng khi mất dữ liệu xảy ra.

### Phase 3 - Kiểm tra integrity tại nguồn dữ liệu cloud
1. Lấy bản `content` hiện tại từ Supabase ngay sau thao tác gây lỗi.
2. Đối chiếu với snapshot trước save để xác định mất dữ liệu do client gửi hay do xử lý server.

### Phase 4 - Chốt nguyên nhân & hướng fix
1. Nếu do race overwrite:
- thêm cơ chế version check (optimistic concurrency) hoặc save queue/debounce.
2. Nếu do normalize:
- chuẩn hóa `trim/case` trước normalize, tránh rớt `Reported`.
3. Nếu do payload cục bộ:
- khóa save khi state chưa stable, hoặc chuyển sang patch-based update theo node thay vì replace full document.

## Acceptance criteria
1. Tái hiện được bug bằng kịch bản rõ ràng.
2. Chỉ ra được nguyên nhân gốc ở code path cụ thể.
3. Có patch fix + test regression đảm bảo không mất item Reported sau save.

## Biện pháp an toàn tạm thời (trong lúc điều tra)
- Hạn chế thao tác save liên tục nhiều lần trong vài giây.
- Trước mỗi thay đổi lớn, export JSON backup.
- Tránh mở nhiều tab editor cùng lúc cho cùng roadmap.
