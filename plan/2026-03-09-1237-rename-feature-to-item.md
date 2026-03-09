# Plan: Đổi `feature` (con của `group`) thành `item`

## Mục tiêu
- Đổi tên node level dưới `group` từ `feature` sang `item` để tránh nhầm lẫn ngữ nghĩa với loại nghiệp vụ `Feature`.
- Giữ hệ thống chạy ổn định với dữ liệu cũ đang dùng `type: 'feature'`.

## Trạng thái hiện tại
- Cây hiện tại: `category -> subcategory -> group -> feature` (+ `team` optional).
- Rất nhiều logic đang hardcode `feature` (type, add child, edit popup, filter priority, style, export, normalize).

## Phạm vi
Bao gồm:
1. Đổi schema type và toàn bộ logic frontend liên quan `feature` -> `item`.
2. Backward compatibility cho dữ liệu cũ (`feature`).
3. Migration mềm khi load/save.
4. Kiểm thử toàn bộ các luồng chính.

Không bao gồm:
- Thay đổi sâu API backend contract (vẫn JSON blob).

## Quyết định tương thích dữ liệu
- Runtime chấp nhận cả `feature` và `item` khi load.
- Chuẩn nội bộ sau normalize: tất cả chuyển thành `item`.
- Khi save: ghi ra `item`.
- Không cần script migrate offline riêng.

## Kế hoạch triển khai chi tiết

### Bước 1: Type schema và normalize
- File: `src/types/roadmap.ts`
- Việc làm:
  1. Đổi `ItemType` từ `'feature'` -> `'item'`.
  2. Thêm normalize type helper (ví dụ `normalizeItemType`): map `'feature'` -> `'item'`.
  3. Cập nhật các interface/comment để phản ánh tên mới.

### Bước 2: Normalize tree khi load
- File: `src/app/page.tsx`
- Việc làm:
  1. Trong `normalizeItemTree`, chuẩn hóa `item.type` thông qua helper mới.
  2. Đảm bảo children vẫn giữ đúng cấu trúc khi chuyển type.

### Bước 3: Grid + thao tác thêm node
- File: `src/components/SpreadsheetGrid.tsx`
- Việc làm:
  1. `CHILD_TYPE_MAP`: `group -> item`.
  2. Cập nhật tất cả điều kiện `row.type === 'feature'` sang `row.type === 'item'`.
  3. Giữ layout/depth/indent tương đương logic cũ cho level này.
  4. Cập nhật các rule priority/phase/tag đang áp dụng cho `feature` để áp dụng cho `item`.

### Bước 4: Add/Edit popup
- Files: `src/components/AddNodePopup.tsx`, `src/components/EditPopup.tsx`
- Việc làm:
  1. Đổi nhánh tạo con từ `feature` sang `item`.
  2. Đổi toàn bộ điều kiện edit hiện đang check `feature` sang `item`.
  3. Đảm bảo các phần Teams/Priority/Phases vẫn áp dụng đúng cho node mới.

### Bước 5: Business helpers/filter
- File: `src/utils/roadmapHelpers.ts`
- Việc làm:
  1. Đổi các điều kiện logic `feature` sang `item` trong filter/priority/status context.
  2. Kiểm tra reorder/update node không phụ thuộc tên cũ.

### Bước 6: Export và các điểm phụ trợ
- File: `src/utils/exportToExcel.ts` (và các file liên quan nếu có)
- Việc làm:
  1. Đảm bảo export hiển thị đúng `type: item`.
  2. Không làm thay đổi format cột ngoài ý muốn.

### Bước 7: Backward compatibility tests
- Test với dữ liệu cũ có `type: 'feature'`:
  1. Load không lỗi.
  2. UI hiển thị đúng như trước.
  3. Chỉnh sửa/lưu lại thành công và type được chuẩn hóa thành `item`.

### Bước 8: Regression tests
- Luồng cần test:
  1. Add `category/subcategory/group/item`.
  2. Edit `item` (status/progress/priority/phase/team).
  3. Filter theo phase/priority/team/status vẫn đúng.
  4. Drag-drop/reorder trong cùng level.
  5. Save/load/download JSON + build lint.

## Rủi ro chính
1. Bỏ sót điều kiện `feature` ở một số component -> lỗi runtime hoặc logic filter sai.
2. Dữ liệu cũ không normalize triệt để -> cây lẫn `feature` và `item`.
3. Sai mapping depth/style -> lệch giao diện timeline/grid.

## Biện pháp giảm thiểu
- Dùng tìm kiếm toàn cục `feature` trước/sau sửa để chốt coverage.
- Ép normalize type ngay tại pipeline load dữ liệu.
- Chạy `npm run lint` + `npm run build` + smoke test tay các luồng chính.

## Acceptance Criteria
1. Cây mới hiển thị và thao tác theo `group -> item`.
2. Dữ liệu cũ `feature` load được bình thường.
3. Sau khi save, dữ liệu chuẩn hóa thành `item`.
4. Không regression ở filter, edit popup, timeline, export.
