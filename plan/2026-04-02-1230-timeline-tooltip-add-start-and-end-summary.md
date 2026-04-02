# Timeline Tooltip - Thêm Start Date và Đưa Duration Vào End Summary

**Ngày tạo:** 2026-04-02
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript)
**Mục đích:** Làm rõ phần thông tin tổng thể ở tooltip timeline bằng cách thêm `Start Date`, và đưa phần tổng kết thời gian tổng thể sang dòng `End Date` thay vì nhét vào dòng trạng thái.

---

## Phân Tích Hiện Trạng

Tooltip tổng thể của row cha trong timeline hiện đang render như sau:

```tsx
<div>
  <div className="font-bold ...">{row.name}</div>
  <div className="text-emerald-400 ...">
    {elapsedStr}
  </div>
</div>
```

### Vấn đề

1. Không có `Start Date` tổng thể nên khó biết task bắt đầu từ đâu.
2. Duration tổng hiện đang nằm trong dòng trạng thái:
   - `Đã hoàn tất (2w 3d)`
   - `Đã chạy 1w 1d (tính tới hn)`
3. Khi nhìn nhanh, user chưa thấy rõ cặp:
   - `Start ...`
   - `End ... (duration)`

### Kỳ vọng mới

Phần tổng thể ở đầu tooltip nên rõ thành 3 lớp:

1. Tên task
2. Trạng thái tổng quan (`Chưa diễn ra`, `Đã chạy ...`, `Đã hoàn tất`)
3. Metadata lịch:
   - `Start 01/04/2026`
   - `End 31/07/2026 (17w 3d)`

---

## Scope

### Trong scope

- Thêm `Start Date` vào block tổng thể của tooltip timeline
- Thêm `End Date` tổng thể
- Chuyển duration tổng từ `elapsedStr` sang nằm cạnh `End Date`
- Giữ lại status line nhưng làm nó thuần trạng thái hơn

### Ngoài scope

- Không đổi layout danh sách child segments bên dưới
- Không đổi logic tính `countWorkdays`
- Không đổi tooltip của single arc nếu chưa cần
- Không đổi export / API / data model

---

## UX Đề Xuất

### Trước

```txt
Interacted URL
Chưa diễn ra
----------------
BA      End 18/04/2026 (2w 3d)
...
```

### Sau

```txt
Interacted URL
Chưa diễn ra
Start 01/04/2026
End 31/07/2026 (17w 3d)
----------------
BA      End 18/04/2026 (2w 3d)
...
```

### Khi đã chạy / hoàn tất

Ví dụ:

```txt
Interacted URL
Đã hoàn tất
Start 01/04/2026
End 31/07/2026 (17w 3d)
```

hoặc:

```txt
Interacted URL
Đã chạy 3w 2d (tính tới hn)
Start 01/04/2026
End 31/07/2026 (17w 3d)
```

> Khuyến nghị: chỉ duration tổng thể nằm ở dòng `End`. Dòng status chỉ nói trạng thái tiến trình.

---

## Phases

| Phase | Nội Dung | Thời Gian |
|------|---------|-----------|
| Phase 1 | Tách status text và tổng duration tổng thể | 20-30 phút |
| Phase 2 | Render Start/End summary trong tooltip header | 20-30 phút |
| Phase 3 | QA các state có/không có date | 15-20 phút |

---

# PHASE 1: Tách Status và Duration Tổng

**Mục tiêu:** Chuẩn hoá dữ liệu hiển thị trước khi render.

## Đề xuất logic

Trong block tooltip hiện tại:

- `elapsedStr` nên chỉ còn là status text
- tính thêm:
  - `overallStartLabel`
  - `overallEndLabel`
  - `overallDurationLabel`

Pseudo-code:

```ts
const overallStartDate = sdRaw && !Number.isNaN(sdRaw.getTime())
  ? format(sdRaw, 'dd/MM/yyyy')
  : null;

const overallEndDate = edRaw && !Number.isNaN(edRaw.getTime())
  ? format(edRaw, 'dd/MM/yyyy')
  : null;

const overallDurationLabel = sdRaw && edRaw
  ? formatWorkdayDuration(countWorkdays(sdCompare, edCompare))
  : null;
```

## Status text mới

Khuyến nghị:

- chưa bắt đầu: `Chưa diễn ra`
- đang chạy: `Đã chạy ${formatWorkdayDuration(...)} (tính tới hn)`
- hoàn tất: `Đã hoàn tất`

Lưu ý:

- duration tổng full của toàn task không nên lặp lại ở `Đã hoàn tất (...)`
- duration tổng đó sẽ chuyển xuống dòng `End`

## Checklist Phase 1

- [ ] Tách `elapsedStr` thành status-only hoặc status-light
- [ ] Tính `overallStartDate`
- [ ] Tính `overallEndDate`
- [ ] Tính `overallDurationLabel`

---

# PHASE 2: Render Start / End Summary

**Mục tiêu:** Hiển thị rõ block tổng thể trong tooltip.

## Layout đề xuất

```tsx
<div>
  <div className="font-bold ...">{row.name}</div>
  <div className="text-emerald-400 ...">{elapsedStr}</div>
  <div className="mt-1 flex flex-col gap-0.5 text-[9.5px] text-slate-300">
    {overallStartDate && <div>Start {overallStartDate}</div>}
    {overallEndDate && (
      <div>
        End {overallEndDate}
        {overallDurationLabel ? ` (${overallDurationLabel})` : ''}
      </div>
    )}
  </div>
</div>
```

## Wording

### Dòng Start

- `Start 01/04/2026`

### Dòng End

- `End 31/07/2026 (17w 3d)`

### Nếu thiếu date

- Không ép render placeholder xấu kiểu `-`
- Chỉ render dòng nào có dữ liệu

Ví dụ:

- có start nhưng chưa có end -> chỉ hiện `Start ...`
- không có cả hai -> chỉ hiện title + status

## Checklist Phase 2

- [ ] Render `Start ...` trong header tooltip
- [ ] Render `End ... (${duration})` trong header tooltip
- [ ] Duration tổng nằm ở `End`, không còn gắn trong câu `Đã hoàn tất (...)`
- [ ] Visual spacing vẫn gọn, không đè phần divider

---

# PHASE 3: QA

## Cases cần check

- [ ] Task có start + end đầy đủ -> hiện cả 2 dòng
- [ ] Task chưa bắt đầu -> status vẫn là `Chưa diễn ra`
- [ ] Task đang chạy -> status `Đã chạy ...`, end vẫn có duration tổng
- [ ] Task đã hoàn tất -> status `Đã hoàn tất`, duration nằm ở dòng End
- [ ] Task thiếu start hoặc thiếu end -> không render placeholder thừa
- [ ] Tooltip không bị quá cao hoặc wrap xấu

## Rủi ro nhỏ

- Nếu giữ cả `Đã hoàn tất (2w 3d)` và `End ... (2w 3d)` sẽ bị lặp thông tin.
- Nếu task không có end mà vẫn cố render duration tổng sẽ gây hiểu nhầm.

---

## Kết Quả Kỳ Vọng

Sau khi hoàn tất, phần tổng thể của tooltip sẽ rõ ràng hơn:

```txt
Interacted URL
Chưa diễn ra
Start 01/04/2026
End 31/07/2026 (17w 3d)
```

Trong đó:

- `Start` cho biết mốc bắt đầu tổng thể
- `End` là nơi chứa tổng kết thời gian
- dòng trạng thái chỉ còn vai trò mô tả tiến trình hiện tại
