# Format Tổng Số Ngày Thành Week + Day - Implementation Plan

**Ngày tạo:** 2026-04-02
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript)
**Mục đích:** Làm rõ cách hiển thị tổng số ngày làm việc trong timeline tooltip bằng format `w + d` thay vì chỉ hiện số ngày thuần.

---

## Phân Tích Hiện Trạng

Hiện tại timeline info popup đang hiển thị thời lượng theo 3 kiểu:

1. Bar label nhỏ: `13d`
2. Tooltip summary: `Đã hoàn tất (13 ngày làm việc)`
3. Tooltip segment/gap:
   - `End 30/04/2026 (12d)`
   - `GAP 18/06 → 06/07 (13 ngày làm việc)`

Điểm gây khó đọc là user phải tự quy đổi số ngày sang tuần làm việc trong đầu. Với roadmap dài, format này khó scan nhanh.

### Code hiện tại

Tất cả logic đang nằm trong `src/components/SpreadsheetGrid.tsx`:

- `countWorkdays()` ở đầu file đang chỉ trả về `number`
- Tooltip timeline đang render trực tiếp:
  - `• ${workdays}d`
  - `${countWorkdays(...)} ngày làm việc`
  - `(${countWorkdays(...)}d)`

### Kỳ vọng UX mới

Chuyển sang quy ước:

- `1d` nếu dưới 1 tuần
- `1w` nếu tròn 5 ngày làm việc
- `1w 1d` nếu là 6 ngày làm việc
- `2w 3d` nếu là 13 ngày làm việc

> **Quy ước tuần:** 1 tuần = 5 ngày làm việc, khớp với cách `countWorkdays()` đang bỏ qua thứ 7 và chủ nhật.

---

## Scope

### Trong scope

- Đổi format hiển thị duration trong tooltip timeline từ số ngày thuần sang `w + d`
- Áp dụng đồng bộ cho:
  - bar label nhỏ trên timeline
  - tooltip status summary (`Đã hoàn tất`, `Đã chạy`)
  - từng dòng segment `End ...`
  - từng dòng `GAP ...`

### Ngoài scope

- Không đổi logic tính ngày làm việc
- Không đổi timeline scale
- Không đổi export Excel / API / data model
- Không đổi wording khác ngoài duration text

---

## Phases

| Phase | Nội Dung | Thời Gian |
|------|---------|-----------|
| Phase 1 | Tạo formatter dùng chung cho workday duration | 20-30 phút |
| Phase 2 | Áp dụng formatter vào các vị trí render trong timeline tooltip | 20-30 phút |
| Phase 3 | QA và rà edge cases wording | 15-20 phút |

---

# PHASE 1: Tạo Formatter Dùng Chung

**Mục tiêu:** Tránh format inline nhiều nơi, gom về 1 helper dễ tái sử dụng.

## Đề xuất

Thêm helper ngay trong `src/components/SpreadsheetGrid.tsx` hoặc tách ra util nếu muốn tái sử dụng về sau:

```ts
function formatWorkdayDuration(workdays: number): string {
  if (workdays <= 0) return '0d';

  const weeks = Math.floor(workdays / 5);
  const days = workdays % 5;

  if (weeks === 0) return `${days}d`;
  if (days === 0) return `${weeks}w`;
  return `${weeks}w ${days}d`;
}
```

## Lưu ý wording

Nên có 2 biến thể:

1. **Compact** cho chỗ ngắn:
   - `1w 1d`
   - `13d` -> `2w 3d`

2. **Readable label** cho chỗ có câu:
   - `1w 1d làm việc`
   - hoặc giữ câu hiện tại nhưng nhúng compact value:
     - `Đã hoàn tất (1w 1d)`
     - `GAP ... (2w 3d làm việc)`

Khuyến nghị:

- bar/segment summary dùng compact
- GAP dùng compact + suffix `làm việc` cho dễ hiểu

## Checklist Phase 1

- [ ] Tạo `formatWorkdayDuration(workdays: number)`
- [ ] Quy ước rõ `1 tuần = 5 ngày làm việc`
- [ ] Handle `0`, `<5`, `=5`, `>5`

---

# PHASE 2: Áp Dụng Vào Timeline Tooltip

**Mục tiêu:** Thay toàn bộ các điểm đang hiển thị số ngày thuần.

## Các điểm cần sửa

### 1. Bar label trên timeline

Hiện tại:

```tsx
{workdays > 0 ? ` • ${workdays}d` : ''}
```

Đổi thành:

```tsx
{workdays > 0 ? ` • ${formatWorkdayDuration(workdays)}` : ''}
```

### 2. Dòng summary trạng thái

Hiện tại:

```tsx
elapsedStr = `Đã hoàn tất (${countWorkdays(sdCompare, edCompare)} ngày làm việc)`;
elapsedStr = `Đã chạy ${countWorkdays(sdCompare, todayCompare)} ngày (tính tới hn)`;
```

Đổi thành:

```tsx
elapsedStr = `Đã hoàn tất (${formatWorkdayDuration(countWorkdays(sdCompare, edCompare))})`;
elapsedStr = `Đã chạy ${formatWorkdayDuration(countWorkdays(sdCompare, todayCompare))} (tính tới hn)`;
```

### 3. GAP row

Hiện tại:

```tsx
GAP ... ({gapWorkdays} ngày làm việc)
```

Đổi thành:

```tsx
GAP ... (${formatWorkdayDuration(gapWorkdays)} làm việc)
```

hoặc tự nhiên hơn:

```tsx
GAP ... (${formatWorkdayDuration(gapWorkdays)})
```

Khuyến nghị: bỏ chữ `ngày`, chỉ giữ compact format để toàn bộ popup nhất quán.

### 4. End row từng segment

Hiện tại:

```tsx
End 30/04/2026 (12d)
```

Đổi thành:

```tsx
End 30/04/2026 (${formatWorkdayDuration(countWorkdays(curStart, curEnd))})
```

## Checklist Phase 2

- [ ] Thay `• 13d` thành `• 2w 3d`
- [ ] Thay `Đã hoàn tất (13 ngày làm việc)` thành `Đã hoàn tất (2w 3d)`
- [ ] Thay `GAP ... (13 ngày làm việc)` thành `GAP ... (2w 3d)`
- [ ] Thay `End ... (12d)` thành `End ... (2w 2d)`

---

# PHASE 3: QA & Edge Cases

**Mục tiêu:** Đảm bảo format mới nhất quán và không gây hiểu nhầm.

## Test cases cần check

- [ ] `1` -> `1d`
- [ ] `4` -> `4d`
- [ ] `5` -> `1w`
- [ ] `6` -> `1w 1d`
- [ ] `10` -> `2w`
- [ ] `13` -> `2w 3d`
- [ ] `0` không làm lộ text thừa
- [ ] Tooltip không bị quá dài hoặc wrap xấu

## Rủi ro nhỏ

- Nếu cùng một popup có chỗ dùng compact, chỗ dùng full text, UX sẽ thiếu nhất quán.
- Nếu sau này app cần locale khác, helper string này nên được tách ra util thay vì để trong component.

---

## Khuyến Nghị Cuối

Nên chốt một chuẩn hiển thị duy nhất:

- Timeline chip / row / summary đều dùng compact `w + d`
- Không giữ song song cả `13 ngày làm việc` và `2w 3d`

Ví dụ sau khi hoàn tất:

- `End 18/04/2026 (2w 3d)`
- `GAP 01/05 → 03/05 (1d)`
- `Đã hoàn tất (1w 1d)`

Điều này giúp popup nhìn gọn hơn và scan nhanh hơn rõ rệt.
