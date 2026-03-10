# Plan: Cho phép chỉnh Status trực tiếp ngoài Grid (như Priority)

## Mục tiêu
- Cho phép user chỉnh `Status` trực tiếp trên cột Status của grid, giống trải nghiệm chỉnh `Priority`.
- Giảm thao tác phải mở popup Edit chỉ để đổi status.

## Hiện trạng
- Cột Status hiện tại click vào sẽ mở `EditPopup`.
- Cột Priority đã có dropdown inline ngay trên grid.
- Status có rule `statusMode`:
  - `manual`: cho phép chỉnh trực tiếp.
  - `auto`: tự tính từ task con, không nên chỉnh thẳng giá trị status.

## Phạm vi
Bao gồm:
1. Thêm dropdown inline cho cột Status.
2. Áp dụng cho các row có thể chỉnh status manual.
3. Với row đang `auto`, giữ trạng thái read-only và hiển thị lý do.

Không bao gồm:
- Đổi thuật toán tính status auto.
- Bỏ `statusMode` hiện tại.

## Kế hoạch triển khai
### Bước 1: Thêm state mở dropdown Status
- File: `src/components/SpreadsheetGrid.tsx`.
- Thêm `openStatusId` tương tự `openPriorityId`.
- Bổ sung đóng dropdown status khi scroll/click ngoài như các dropdown khác.

### Bước 2: Thay cột Status sang cơ chế dropdown inline
- Vị trí: block Status trong row render.
- Khi row cho phép chỉnh:
  - click mở dropdown chứa `STATUS_OPTIONS`.
  - chọn option -> `updateFromSource(...)` với:
    - `status`
    - `manualStatus`
    - `statusMode: 'manual'` (nếu cần)
  - đóng dropdown.
- Không có nút `Clear` vì status là field bắt buộc.

### Bước 3: Rule cho row không chỉnh trực tiếp
- Nếu row có children và `statusMode === 'auto'`:
  - không mở dropdown.
  - vẫn hiển thị badge status hiện tại + tooltip “Auto từ task con”.
- Giữ behavior fallback mở Edit popup (nếu cần) cho các trường hợp đặc biệt.

### Bước 4: Đồng bộ UX với Priority
- Style dropdown, hover, click-outside tương đồng cột Priority.
- Khi mở 1 dropdown thì đóng các dropdown khác (`workType`, `priority`, `phase`, `status`).

### Bước 5: Test
1. Row manual: đổi status inline thành công.
2. Row auto: không chỉnh trực tiếp, hiển thị đúng thông báo.
3. Đổi status xong -> Save -> reload vẫn đúng.
4. Không làm vỡ filter status hiện có.
5. `npm run lint` + `npm run build`.

## Rủi ro và giảm thiểu
- Rủi ro mâu thuẫn auto/manual:
  - khóa chỉnh inline cho row auto.
- Rủi ro xung đột với popup Edit cũ:
  - ưu tiên dropdown inline cho thao tác status; giữ popup cho chỉnh sâu.
- Rủi ro click ngoài không đóng menu:
  - tái dùng pattern click-outside đã có cho priority/phase/workType.

## Tiêu chí hoàn tất
1. Chỉnh status trực tiếp ngoài grid được với row manual.
2. Row auto không bị chỉnh sai rule.
3. UX cột Status đồng nhất với Priority.
4. Lint/build pass.
