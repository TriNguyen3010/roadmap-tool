# Plan Fix theo Review: WorkType Classification

## Bối cảnh
Review tại `plan/Check/worktype-expansion-review.md` nêu 4 vấn đề chính:
1. Xung đột ngữ nghĩa giữa `type = 'feature'` (cấu trúc cây) và nhãn phân loại `Feature`.
2. Trùng lặp nguồn dữ liệu giữa `subcategoryType` và `workType`.
3. Mâu thuẫn cha/con khi cho phép gán loại ở nhiều cấp.
4. Nguy cơ quá tải giao diện grid khi thêm badge dày đặc.

## Quyết định fix (để tránh rủi ro)
- Không rollout field `workType` cho `group/feature` ở phase này.
- Dùng **1 nguồn sự thật duy nhất** cho phân loại nghiệp vụ tại cấp `subcategory`.
- Mở rộng phân loại hiện có thành: `Feature`, `Improvement`, `Bug`, `Growth Camp`.
- Chuẩn hóa alias dữ liệu cũ: `Bugs` -> `Bug`.
- Descendants (`group/feature/team`) dùng giá trị **kế thừa tính toán** (effective), không chỉnh trực tiếp.

## Mục tiêu sau fix
- User phân loại rõ 4 nhóm nghiệp vụ theo đúng yêu cầu.
- Không phát sinh conflict cha/con.
- Không làm rối UI hiện tại.
- Filter/report có logic nhất quán.

## Phạm vi triển khai

### 1) Data model + normalize
- Cập nhật `SubcategoryType`:
  - `Feature | Improvement | Bug | Growth Camp`
- Cập nhật normalize để map:
  - `Bugs` -> `Bug`
- Không thêm `workType` mới vào `RoadmapItem` ở phase này.

### 2) UI chỉnh sửa
- `EditPopup` (node `subcategory`): thêm option `Improvement` vào cụm chọn loại.
- Giữ UX hiện tại, chỉ mở rộng enum và style.

### 3) Hiển thị Grid
- `SpreadsheetGrid`:
  - Bổ sung style badge cho `Improvement`.
  - Chỉ hiển thị badge ở row `subcategory` như hiện tại (không nhồi thêm ở `group/feature`).

### 4) Filter logic
- Thêm filter theo **Loại Subcategory** (không theo tên subcategory).
- Logic filter:
  - OR trong nhóm loại.
  - AND với các filter khác (phase/status/priority/team...).
- Khi lọc theo loại, branch con của subcategory match vẫn được hiển thị theo tree.

### 5) Backward compatibility
- Dữ liệu cũ đang có `Feature/Bug/Growth Camp`: giữ nguyên.
- Dữ liệu cũ có `Bugs`: normalize về `Bug` khi load.
- Không cần migration cấu trúc cây.

### 6) Quy tắc inheritance rõ ràng
- `effectiveType` chỉ là giá trị tính toán tại runtime cho descendants (nếu cần dùng cho filter/report).
- Không cho phép user set loại khác nhau ở `group/feature` tại phase này.

## Kế hoạch thực hiện
1. Cập nhật type + normalize trong `src/types/roadmap.ts`.
2. Cập nhật `EditPopup` + style `SUB_TYPE_STYLE` cho `Improvement`.
3. Cập nhật `SpreadsheetGrid` render badge `Improvement`.
4. Bổ sung state + UI filter loại trong `FilterPopup` + `page.tsx` + `roadmapHelpers.ts`.
5. Test regression save/load/filter + `npm run lint` + `npm run build`.

## Tiêu chí hoàn tất
- Có thể gán `Improvement` ở subcategory.
- Badge hiển thị đúng 4 loại.
- Filter theo loại hoạt động đúng với tree.
- Không có conflict cha/con do gán nhiều cấp.
- Build/lint pass.

## Mở rộng phase sau (optional)
- Nếu thực sự cần phân loại ở `group/feature`, tách thành phase 2 với thiết kế mới:
  - Đổi tên dimension tránh trùng nghĩa (`deliveryType`),
  - Rule inheritance cứng,
  - Cơ chế override có kiểm soát,
  - Thiết kế UI gọn để tránh clutter.
