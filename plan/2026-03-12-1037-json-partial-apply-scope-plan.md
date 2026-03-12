# Plan: Import JSON theo scope (chỉ apply cụm data được chọn)

## Mục tiêu
- Khi load 1 file JSON, user có thể chọn **chỉ apply một phần dữ liệu** thay vì ghi đè toàn bộ.
- Tránh mất dữ liệu hiện tại khi file JSON chứa quá nhiều phần không liên quan.

## Bài toán cần giải
- JSON roadmap chứa nhiều nhóm dữ liệu khác nhau:
  1. `items` (cây dữ liệu roadmap)
  2. `milestones` (phase)
  3. `settings` (filter/view/column/timeline)
  4. metadata khác (`releaseName`, `startDate`, `endDate`)
- User chỉ muốn lấy một cụm (ví dụ: chỉ một category, hoặc chỉ milestones, hoặc chỉ settings view).

## Đề xuất "Data Apply Types" (loại dữ liệu có thể apply)
### Level A - Theo khối lớn
1. `Project Metadata`
- `releaseName`, `startDate`, `endDate`

2. `Milestones / Phases`
- chỉ `milestones`

3. `View Settings`
- `settings` (filter, column visibility, timeline, expanded/hidden rows)

4. `Roadmap Items`
- `items`

### Level B - Chi tiết trong Items (apply theo cụm)
1. `All Items` (toàn bộ cây)
2. `By Category` (chọn 1..n category)
3. `By Subcategory` (chọn 1..n subcategory trong category)
4. `By Group IDs` (apply chính xác theo ID nhóm/item)
5. `By Phase` (chỉ item có `phaseIds` match)
6. `By Priority` (ví dụ chỉ `Reported`)

## Import mode
1. `Merge (Recommended)`
- Chỉ update node match theo `id`.
- Node mới (id chưa tồn tại) có thể cho phép thêm mới theo option.
- Không xóa dữ liệu ngoài scope chọn.

2. `Replace Scoped`
- Thay thế toàn bộ cụm đã chọn bằng dữ liệu từ file import.
- Dữ liệu ngoài scope giữ nguyên.

3. `Full Replace` (giống hiện tại)
- Ghi đè toàn bộ document.

## UX flow đề xuất
1. User chọn file JSON.
2. Parse + validate schema.
3. Mở popup `Apply Scope` với:
- checklist khối lớn (Metadata / Milestones / Settings / Items)
- nếu chọn Items -> mở panel chọn scope chi tiết (Category/Subcategory/IDs/Phase/Priority)
- chọn Import mode (Merge / Replace Scoped / Full Replace)
4. Hiển thị `Preview Diff` trước khi apply:
- số node thêm mới
- số node cập nhật
- số node bị ảnh hưởng theo category
5. User confirm -> apply -> save.

## Rule an toàn dữ liệu
1. Mặc định chọn `Merge`.
2. Mặc định không xóa node ngoài scope.
3. Bắt buộc có preview diff trước nút Apply.
4. Tự động tạo backup snapshot trước khi apply (in-memory + cho phép export JSON trước apply).

## Phạm vi code
1. `src/components/Toolbar.tsx`
- mở flow import mới (thay vì load thẳng vào state).

2. `src/app/page.tsx`
- thêm parser + scope apply engine.
- tách logic `handleLoadJson` thành:
  - parse
  - preview
  - apply by scope

3. `src/utils/roadmapHelpers.ts` (hoặc file util mới)
- hàm merge/replace scoped theo `id`.
- helper lấy scope theo category/subcategory/phase/priority.

4. `src/types/roadmap.ts`
- type cho import options + preview summary.

## Kế hoạch triển khai
### Phase 1 - Define import contract
1. Thiết kế `ImportScopeOptions` + `ImportMode`.
2. Thiết kế format preview summary.

### Phase 2 - Apply engine (không UI trước)
1. Implement merge scoped theo `id`.
2. Implement replace scoped.
3. Unit test các case chính:
- chỉ milestones
- chỉ settings
- items theo category
- items theo priority reported

### Phase 3 - UI chọn scope + preview
1. Thêm popup chọn data apply types.
2. Thêm preview diff trước confirm.

### Phase 4 - Integration + QA
1. Verify không mất dữ liệu ngoài scope.
2. Verify full replace vẫn hoạt động như cũ.
3. Verify save/export sau import không lỗi.

## Acceptance criteria
1. User có thể apply riêng từng loại data (`metadata`, `milestones`, `settings`, `items`).
2. Với `items`, user có thể apply theo cụm (category/subcategory/phase/priority/ids).
3. Có preview diff trước apply.
4. Mặc định không ghi đè toàn bộ nếu user không chọn `Full Replace`.
