# Plan: Mark icon tạm thời trước text của Group

## Mục tiêu
- Thêm 1 điểm đánh dấu nhanh cho `group` để user rà soát task đã làm.
- Mark chỉ phục vụ đối chiếu trong phiên làm việc hiện tại.
- Không lưu vào DB, không lưu vào file JSON, không đi vào luồng Save.

## Yêu cầu chức năng
1. Icon mark nằm **ngay trước text name của group**.
2. Chỉ hiển thị/tương tác cho `row.type === 'group'`.
3. Click icon:
- bật mark (đã rà soát) / tắt mark.
4. Không ảnh hưởng dữ liệu roadmap:
- không sửa `items`
- không vào `buildDocumentSnapshot`
- không gửi `/api/roadmap/save`
5. Reload trang thì mark reset (đúng chủ đích “không cần lưu”).

## Phạm vi
Bao gồm:
1. UI icon mark tại name cell của group.
2. Local state tạm cho danh sách group đã mark.
3. Xử lý event để không đụng các click behavior khác.

Không bao gồm:
- Persist mark theo user/account.
- Đồng bộ mark giữa nhiều trình duyệt/máy.

## Kế hoạch triển khai
### Bước 1: Tạo state tạm trong `SpreadsheetGrid`
- File: `src/components/SpreadsheetGrid.tsx`
- Thêm state local:
  - `const [reviewedGroupIds, setReviewedGroupIds] = useState<Set<string>>(new Set())`
- Helper toggle theo `groupId`.

### Bước 2: Render icon mark trước text group
- Tại name cell khu vực trước `<span>{row.name}</span>` (đoạn quanh dòng ~1125+).
- Nếu `row.type === 'group'`:
  - hiển thị icon dạng vòng tròn/check (unchecked/checked).
  - checked state lấy từ `reviewedGroupIds.has(row.id)`.

### Bước 3: Event handling an toàn
- Click icon dùng `e.stopPropagation()` để:
  - không trigger `openEditor(row.id)` của name cell.
  - không ảnh hưởng expand/collapse hay các action khác.
- Click vào text group vẫn giữ behavior cũ.

### Bước 4: UX hoàn thiện
- Tooltip:
  - unchecked: `Đánh dấu đã rà soát`
  - checked: `Bỏ đánh dấu`
- Style nhẹ, rõ trạng thái nhưng không lấn át tên group.

### Bước 5: Test
1. Group: click icon bật/tắt đúng.
2. Non-group: không có icon mark.
3. Click icon không mở popup edit.
4. Save dữ liệu không chứa state mark.
5. Reload trang: mark tự reset.
6. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro click icon kích hoạt edit popup:
  - giảm thiểu bằng `stopPropagation`.
- Rủi ro user kỳ vọng mark được lưu:
  - giảm thiểu bằng tooltip/note “tạm thời”.
- Rủi ro state Set mutate sai:
  - luôn clone Set khi update (`new Set(prev)`).

## Tiêu chí hoàn tất
1. User mark được group ngay tại cột Name.
2. Mark chỉ là state tạm trong UI, không vào JSON/DB.
3. Không làm hỏng luồng edit/filter/save hiện tại.
4. Lint/build pass.
