# Plan: Thêm bộ status theo workflow BA/PD/Dev/QC/Growth

## Mục tiêu
- Mở rộng status từ 4 trạng thái hiện tại lên bộ workflow đầy đủ theo team.
- Giữ tương thích dữ liệu cũ và không làm vỡ các tính năng filter/report/export.
- Đồng bộ `Summary by Object` theo hướng đủ team BA/PD/Dev/QC/Growth.

## Danh sách status mới (thứ tự hiển thị đề xuất)
1. `Not Started`
2. `BA Handle`
3. `BA In Progress`
4. `PD Handle`
5. `PD In Progress`
6. `Dev Handle`
7. `Dev In Progress`
8. `QC Handle`
9. `QC In Progress`
10. `Growth Handle`
11. `Growth In Progress`
12. `Done`

## Rule Summary by Object (update all team)
1. `App (Mobile)`:
- `type = group`
- thuộc subcategory `App`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

2. `Core`:
- `type = group`
- thuộc subcategory `Core`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

3. `Web`:
- `type = group`
- thuộc subcategory `Web`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

4. `Team BA`:
- `type = item`
- có team descendant chứa `BA`
- status thuộc `{ BA Handle, BA In Progress }`

5. `Team PD (Product Design)`:
- `type = item`
- có team descendant chứa `PD`
- status thuộc `{ PD Handle, PD In Progress }`

6. `Team Dev`:
- `type = item`
- có team descendant chứa `FE` hoặc `BE`
- status thuộc `{ Dev Handle, Dev In Progress, Done }`

7. `Team QC`:
- `type = item`
- có team descendant chứa `QC`
- status thuộc `{ QC Handle, QC In Progress }`

8. `Team Growth`:
- `type = item`
- có team descendant chứa `Growth`
- status thuộc `{ Growth Handle, Growth In Progress }`

## Phạm vi ảnh hưởng trong code
1. `src/types/roadmap.ts`
- Mở rộng `ItemStatus` union.
- Cập nhật `STATUS_OPTIONS` theo thứ tự mới.
- Cập nhật `normalizeItemStatus` và `normalizeStatusFilter`.

2. `src/utils/roadmapHelpers.ts`
- Cập nhật luật auto-derive status cho parent (category/group/subgroup).
- Định nghĩa precedence rõ ràng khi có nhiều child status khác nhau.

3. `src/components/SpreadsheetGrid.tsx`
- Cập nhật màu hiển thị cho status tag/bar (`STATUS_BAR_COLOR`, `STATUS_TAG_BG`, `STATUS_TAG_TEXT`).
- Dropdown inline status dùng đầy đủ bộ status mới.
- Tooltip/label vẫn rõ và không tràn.

4. `src/components/EditPopup.tsx`
- Dropdown status trong popup edit dùng bộ status mới.
- Logic set progress giữ tương thích (`Done`=100, `Not Started`=0), các status khác giữ giá trị hiện tại.

5. `src/components/FilterPopup.tsx`
- Nhóm filter status hiển thị đủ 12 trạng thái.

6. `src/utils/exportToExcel.ts`
- Cập nhật rule `Summary by Object` theo all-team:
  - `App/Core/Web`: `{ Dev Handle, Dev In Progress, Done }`
  - `Team BA`: `{ BA Handle, BA In Progress }`
  - `Team PD`: `{ PD Handle, PD In Progress }`
  - `Team Dev`: `{ Dev Handle, Dev In Progress, Done }`
  - `Team QC`: `{ QC Handle, QC In Progress }`
  - `Team Growth`: `{ Growth Handle, Growth In Progress }`
- Giữ format sheet summary hiện tại (`ID | Nội dung`), thứ tự block rõ ràng.
- Bổ sung kiểm tra tương thích đầy đủ cho cả `Export Current View` và `Export Full Data` khi có 12 status mới.

7. `src/components/AddNodePopup.tsx`
- Default status vẫn `Not Started`.

## Quy tắc auto-derive status (đề xuất)
- Nếu tất cả child `Done` -> parent `Done`.
- Nếu tất cả child `Not Started` -> parent `Not Started`.
- Nếu có `Dev In Progress` -> parent `Dev In Progress`.
- Nếu có `PD In Progress` -> parent `PD In Progress`.
- Nếu chỉ có các trạng thái `Handle` (chưa có `In Progress`) -> parent lấy theo team precedence:
  - `Growth Handle` > `QC Handle` > `Dev Handle` > `PD Handle` > `BA Handle`.
- Fallback: `Not Started`.

## Tương thích dữ liệu cũ
- `In Progress` cũ vẫn map sang `Dev In Progress`.
- Các status không hợp lệ map về `Not Started`.
- Không cần migrate file JSON thủ công; normalize khi load.

## Kế hoạch triển khai
### Phase 1 - Core Status Model
1. Cập nhật `ItemStatus`, `STATUS_OPTIONS`, normalize functions.
2. Cập nhật unit test cho normalize.

### Phase 2 - UI/Dropdown/Color
1. Cập nhật SpreadsheetGrid (tag, dropdown, bar màu).
2. Cập nhật EditPopup + FilterPopup.
3. Soát overflow/align text với status dài.

### Phase 3 - Auto Logic + Report/Export
1. Cập nhật auto-derive status trong `roadmapHelpers`.
2. Cập nhật `Summary by Object` theo rule all-team:
- `App/Core/Web`: nhận `Dev Handle`, `Dev In Progress`, `Done`.
- Thêm block `Team BA`, `Team PD`, `Team Dev`, `Team QC`, `Team Growth`.
- Giữ format `ID | Nội dung` và prefix `Group: Feature`.
3. Cập nhật test cho filter + recalculate + export summary.
4. Kiểm tra tương thích export excel:
- Cột `Status` xuất đúng text status mới, không bị map sai về status cũ.
- `Export Current View` bám đúng rows + cột show/hide của user khi status mới được áp dụng.
- `Export Full Data` chứa đầy đủ item có status mới, không rớt dòng.
- Summary/report section không crash khi gặp status mới và block team mới.
- Thứ tự dòng không đổi khi chỉ thay status.

### Phase 4 - QA end-to-end
1. Tạo item mới -> `Not Started`.
2. Đổi status qua đủ 12 trạng thái ở grid và edit popup.
3. Filter status đúng tập row.
4. Save JSON / load JSON giữ nguyên status.
5. Export Excel không sai logic report đã cập nhật (App/Core/Web + all team).

## Acceptance criteria
1. 12 status hiển thị đầy đủ ở mọi nơi (grid/edit/filter).
2. Không lỗi type/compile và không regression chức năng cũ.
3. Data cũ vẫn load được bình thường.
4. Report/export không lệch so với rule đã chốt trước đó.
5. Excel xuất ra mở được bình thường trên file lớn và không lỗi encoding với status mới.
6. `Summary by Object` có đủ block team BA/PD/Dev/QC/Growth.
7. App/Core/Web có nhận status `Done` trong summary.

## Ghi chú cần xác nhận
- `Team Dev` hiện gộp `FE + BE` thành một block. Nếu cần tách FE/BE, thêm phase mở rộng.
- Nếu muốn tách thêm cột phụ `Status Group` (Handle/In Progress/Done) cho Excel, sẽ bổ sung phase mở rộng riêng để tránh thay đổi format report hiện tại.
