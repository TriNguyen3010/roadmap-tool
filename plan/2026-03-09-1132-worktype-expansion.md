# Plan: Mở rộng phân loại Feature / Improvement / Bugs / Growth Camp

## Mục tiêu
- Bổ sung phân loại nghiệp vụ rõ ràng cho roadmap: `Feature`, `Improvement`, `Bug`, `Growth Camp`.
- Cho phép gán loại ở cấp thực thi (ưu tiên `group` và `feature`) để lọc và theo dõi chính xác.
- Giữ tương thích với dữ liệu cũ đang dùng `subcategoryType`.

## Quyết định thiết kế (khuyến nghị)
- Dùng field mới `workType` cho `group` và `feature`.
- Chuẩn enum:
  - `Feature`
  - `Improvement`
  - `Bug`
  - `Growth Camp`
- Chuẩn hóa alias nhập cũ:
  - `Bugs` -> `Bug`

## Phạm vi
Bao gồm:
1. Data model + normalize.
2. UI chỉnh sửa (`EditPopup`) cho `group/feature`.
3. Hiển thị tag `workType` trong `SpreadsheetGrid`.
4. Filter theo `workType`.
5. Save/load + backward compatibility.

Không bao gồm (phase sau):
- Báo cáo nâng cao theo workType.
- KPI theo workType.

## Kế hoạch triển khai

### Bước 1: Schema và normalize
- Cập nhật `src/types/roadmap.ts`:
  - Thêm `type WorkType = 'Feature' | 'Improvement' | 'Bug' | 'Growth Camp'`.
  - Thêm `WORK_TYPE_OPTIONS`.
  - Thêm `normalizeWorkType(value)` và `normalizeWorkTypeFilter(values)`.
  - Thêm `workType?: WorkType` vào `RoadmapItem`.
  - Thêm `filterWorkType?: string[]` vào `RoadmapDocument.settings`.

### Bước 2: Load/persist state
- Cập nhật `src/app/page.tsx`:
  - State `filterWorkType`.
  - Load từ `settings.filterWorkType`.
  - Persist vào snapshot/settings khi save/export JSON.

### Bước 3: Edit UI
- Cập nhật `src/components/EditPopup.tsx`:
  - Hiển thị trường chọn `workType` cho `group` và `feature`.
  - Có `Clear` để bỏ gán.
  - Lưu vào `onSave` tương tự priority.

### Bước 4: Grid hiển thị
- Cập nhật `src/components/SpreadsheetGrid.tsx`:
  - Hiển thị badge `workType` trên row `group/feature`.
  - Màu riêng cho từng loại:
    - Feature: xanh dương
    - Improvement: vàng/cam
    - Bug: đỏ
    - Growth Camp: xanh lá
  - Ưu tiên không làm tăng chiều cao row.

### Bước 5: Filter theo workType
- Cập nhật `src/components/FilterPopup.tsx`:
  - Thêm nhóm filter `workType` multi-select.
- Cập nhật `src/utils/roadmapHelpers.ts`:
  - Thêm điều kiện lọc `workType`.
  - Logic: OR trong nhóm workType, AND với các nhóm filter khác.

### Bước 6: Backward compatibility
- Khi load dữ liệu cũ:
  - Nếu chưa có `workType` thì giữ `undefined`.
  - Không làm vỡ dữ liệu `subcategoryType` hiện có.
- Nếu cần migration mềm:
  - Có thể map tạm `subcategoryType -> workType` cho descendants chỉ khi descendants chưa có `workType`.

### Bước 7: Regression test
- Luồng chỉnh sửa:
  - Set/Clear `workType` tại `group/feature`.
- Luồng lọc:
  - Filter `workType` độc lập và kết hợp với phase/priority/team/status.
- Luồng save/load:
  - Reload vẫn giữ đúng `workType` + `filterWorkType`.
- Build quality:
  - `npm run lint`, `npm run build` pass.

## Rủi ro và giảm thiểu
- Rủi ro trùng nghĩa giữa `subcategoryType` và `workType`.
  - Giảm thiểu: coi `subcategoryType` là phân loại ở layer subcategory, `workType` là loại công việc ở layer thực thi.
- Rủi ro dữ liệu cũ hiển thị thiếu tag.
  - Giảm thiểu: cho phép migration mềm/tạm mapping nếu cần.

## Tiêu chí hoàn tất
1. Có thể set `workType` ở `group/feature` trong popup Edit.
2. Grid hiển thị badge đúng màu và đúng loại.
3. Filter theo `workType` hoạt động ổn định.
4. Save/load không mất dữ liệu và không phá dữ liệu cũ.
