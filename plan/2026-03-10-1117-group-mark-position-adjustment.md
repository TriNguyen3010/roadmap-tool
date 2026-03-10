# Plan: Đổi vị trí marker rà soát Group theo hình vẽ

## Mục tiêu
- Di chuyển marker rà soát Group sang đúng vị trí bạn khoanh đỏ trên ảnh.
- Không hiển thị trạng thái “chưa mark” để tiết kiệm diện tích.
- User click vào vùng đó:
  - lần 1: hiện marker đã check
  - lần 2: marker biến mất

## Yêu cầu chi tiết
1. Vị trí marker:
- Đặt tại slot trước cụm icon/text hiện tại của Name cell (đúng điểm khoanh đỏ).
2. Trạng thái mặc định:
- Không hiện icon rỗng, không viền tròn.
- Chỉ khi đã mark mới render icon check.
3. Tương tác:
- Có vùng click cố định nhỏ (hit-area) ngay vị trí đó dù đang unmarked.
- Toggle 2 trạng thái (checked/unchecked).
4. Dữ liệu:
- Vẫn là state tạm trong UI, không lưu DB/JSON.

## Phạm vi
Bao gồm:
1. Chỉnh layout marker trong `SpreadsheetGrid` theo vị trí mới.
2. Chỉnh render logic chỉ hiện icon khi checked.
3. Giữ nguyên logic toggle state tạm và `stopPropagation`.

Không bao gồm:
- Persist marker.
- Đổi logic save/filter.

## Kế hoạch triển khai
### Bước 1: Dời slot marker
- File: `src/components/SpreadsheetGrid.tsx`.
- Di chuyển marker từ vị trí hiện tại (đang nằm gần text/phase tags) sang vị trí trước cụm đó theo đúng ảnh.

### Bước 2: Render tối giản
- Khi `isGroupReviewed === false`:
  - không render icon/viền.
  - chỉ giữ vùng click nhỏ trong suốt.
- Khi `isGroupReviewed === true`:
  - render icon check rõ ràng.

### Bước 3: Giữ behavior click an toàn
- `onMouseDown` + `onClick` dùng `stopPropagation` để không mở popup edit.
- Chỉ áp dụng cho `row.type === 'group'`.

### Bước 4: Test
1. Group chưa mark: UI không thấy icon.
2. Click vùng marker: icon check xuất hiện.
3. Click lại: icon biến mất.
4. Click marker không mở edit popup.
5. Reload trang: marker reset.
6. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro user không biết có vùng click khi chưa mark:
  - dùng hit-area đủ lớn và tooltip khi hover.
- Rủi ro click nhầm mở edit:
  - giữ `stopPropagation` trên marker.

## Tiêu chí hoàn tất
1. Marker nằm đúng vị trí bạn chỉ định.
2. Unchecked không hiện gì; checked mới hiện.
3. Toggle hoạt động đúng và không ảnh hưởng save/data.
4. Lint/build pass.
