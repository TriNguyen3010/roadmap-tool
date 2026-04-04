# Timeline Baseline Axis — Implementation Plan

**Ngày tạo:** 2026-04-04
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript + Supabase)
**Mục đích:** Thêm đường trục ngang (baseline axis) cho các arc cong trên timeline, giúp mắt dễ theo dõi xuất phát và kết thúc của mỗi arc.

---

## Bài Toán

### Hiện trạng

Các arc cong hiện tại "treo lơ lửng" — không có đường tham chiếu nào cho mắt biết các chấm tròn nằm ở đâu:

```
  ╭───── PD.S ─────╮   ╭── FE.S ──╮      ╭─ QC ─╮
  ●                 ●   ●          ●      ●       ●     ← chấm treo lơ lửng
```

### Mục tiêu

Thêm đường trục ngang nối từ chấm đầu đến chấm cuối ở row tổng kết (parent multi-arc), các chấm tròn nằm **đè lên** đường trục:

```
  ╭───── PD.S ─────╮   ╭── FE.S ──╮      ╭─ QC ─╮
  ●━━━━━━━━━━━━━━━━━●━━━●━━━━━━━━━━●━━━━━━●━━━━━━●     ← đường trục + chấm đè lên
```

---

## Phạm Vi

### Áp dụng cho

- **Row tổng kết (parent multi-arc):** Row có `hasChildSegments = true`, hiển thị nhiều arc con.
- Đường trục chạy từ **chấm trái nhất** (startX của segment đầu) đến **chấm phải nhất** (endX của segment cuối).

### KHÔNG áp dụng cho

- **Leaf item (single arc):** Chỉ có 1 arc → đường trục không có ý nghĩa vì 2 đầu arc đã nối nhau.
- **Category rows:** Đã bị loại bỏ bởi `row.type !== 'category'` check.

---

## Phân Tích Code Hiện Tại

### Vị trí render multi-arc

**File:** `src/components/SpreadsheetGrid.tsx` — block `{hasChildSegments ? (...)}`

```
SVG container (width=segTotalWidth, height=ROW_HEIGHT)
  └─ [VỊ TRÍ THÊM ĐƯỜNG TRỤC] ← render TRƯỚC arcs → nằm DƯỚI trong SVG z-order
  └─ layeredChildSegments.map() → <TimelineArc> cho mỗi child
```

### Baseline trong TimelineArc

```typescript
// TimelineArc.tsx line 29:
const baseline = rowHeight - 6;   // = 28 - 6 = 22px

// Chấm tròn nằm tại baseline:
<circle cx={start} cy={baseline} r={dotRadius} fill={color} />
<circle cx={end}   cy={baseline} r={dotRadius} fill={color} />
```

**→ Đường trục phải nằm tại `y = ROW_HEIGHT - 6 = 22px`** để trùng với vị trí các chấm.

### Tọa độ segment đã có

```typescript
segMinLeft    // left nhỏ nhất trong tất cả child segments
segMaxRight   // right lớn nhất (left + width)
segTotalWidth // segMaxRight - segMinLeft

// Mỗi segment:
seg.left      // absolute left position
seg.width     // chiều rộng segment

// Arc endpoint padding (chấm nằm giữa ô ngày đầu/cuối):
getArcEndpointPadding(seg.width, timelineUnitWidth)  // = timelineUnitWidth / 2
```

---

## Thiết Kế Kỹ Thuật

### Thành Phần 1: Đường trục ngang (đã implement)

**Trạng thái: ✅ ĐÃ CODE**

```typescript
// Trong SVG container, render TRƯỚC các TimelineArc:
{(() => {
    const axisBaseline = ROW_HEIGHT - 6;                    // y = 22px

    // Tìm segment trái nhất và phải nhất
    const firstSeg = layeredChildSegments.reduce(
        (min, s) => s.left < min.left ? s : min,
        layeredChildSegments[0]
    );
    const lastSeg = layeredChildSegments.reduce(
        (max, s) => (s.left + s.width) > (max.left + max.width) ? s : max,
        layeredChildSegments[0]
    );

    // Tính x1, x2 khớp chính xác với vị trí chấm tròn
    const axisX1 = (firstSeg.left - segMinLeft)
                 + getArcEndpointPadding(firstSeg.width, timelineUnitWidth);
    const axisX2 = (lastSeg.left - segMinLeft)
                 + Math.max(
                     getArcEndpointPadding(lastSeg.width, timelineUnitWidth),
                     lastSeg.width - getArcEndpointPadding(lastSeg.width, timelineUnitWidth)
                   );

    return axisX2 > axisX1 ? (
        <line
            x1={axisX1} y1={axisBaseline}
            x2={axisX2} y2={axisBaseline}
            stroke={hasActiveInfo ? '#475569' : '#94a3b8'}
            strokeWidth={hasActiveInfo ? 1.2 : 0.8}
            opacity={hasActiveInfo ? 0.6 : 0.35}
            strokeLinecap="round"
        />
    ) : null;
})()}
```

### Z-order (thẩm mĩ — trục nằm dưới chấm)

SVG render theo thứ tự source code: element trước → nằm dưới, element sau → nằm trên.

```
SVG rendering order:
  1. <line> (đường trục)      ← render trước → nằm DƯỚI CÙNG
  2. <TimelineArc> (arc + dots) ← render sau → chấm tròn NẰM TRÊN đường trục ✓
```

Chấm tròn (radius 3-3.4px, fill solid) luôn đè lên đường trục (strokeWidth 0.8-1.2px) → **thẩm mĩ đảm bảo**.

### Visual Specs

| Thuộc tính | Bình thường | Hover/Active |
|---|---|---|
| Stroke color | `#94a3b8` (slate-400) | `#475569` (slate-600) |
| Stroke width | 0.8px | 1.2px |
| Opacity | 0.35 | 0.6 |
| Line cap | round | round |

Thiết kế cố ý **mảnh và nhạt** để không cạnh tranh thị giác với các arc cong — chỉ đóng vai trò tham chiếu phụ.

---

## Cải Tiến Thêm (chưa implement)

### 2. Chấm tròn nhỏ tại giao điểm trục — các segment gap

Khi 2 segment không nối liền nhau (gap giữa), đường trục chạy qua vùng trống. Có thể thêm tick marks nhỏ tại vị trí chuyển tiếp:

```
  ╭── PD ──╮          ╭── FE ──╮
  ●━━━━━━━━●━ ━ ━ ━ ━ ●━━━━━━━━●    ← nét đứt ở vùng gap
            ↑  (gap)   ↑
```

```typescript
// Optional: nét đứt cho phần gap giữa các segments
// Thay vì 1 line liền → render nhiều đoạn:
// - Đoạn có segment: nét liền
// - Đoạn gap: nét đứt (strokeDasharray="4 3")
```

**Effort:** ~1 giờ. **Ưu tiên:** Thấp — đường liền hiện tại đã đủ rõ.

### 3. Start/End tick marks

Thêm tick nhỏ dọc (|) tại điểm đầu và cuối của đường trục:

```
  ╭── PD ──╮   ╭── FE ──╮
  |●━━━━━━━━●━━━●━━━━━━━━●|
  ↑                        ↑
  start tick           end tick (3px cao)
```

```typescript
// Tick mark tại 2 đầu:
<line x1={axisX1} y1={axisBaseline - 3} x2={axisX1} y2={axisBaseline + 3}
      stroke={color} strokeWidth={0.8} opacity={0.3} />
```

**Effort:** ~15 phút. **Ưu tiên:** Thấp.

### 4. Tích hợp với bar mode (nếu triển khai timeline-bar-mode-plan)

Khi chuyển sang Gantt bar mode, đường trục ngang **không cần thiết** vì bars đã là hình chữ nhật nằm ngang. Chỉ áp dụng cho arc mode.

```typescript
// Conditional: chỉ render axis khi arc mode
{timelineDisplayMode !== 'bar' && axisX2 > axisX1 && (
    <line ... />
)}
```

### 5. Tích hợp với multi-team arcs (nếu triển khai multi-team plan)

Khi mỗi item có nhiều team arcs, mỗi team có arc riêng → đường trục vẫn chạy từ chấm đầu đến chấm cuối, bao trùm tất cả team arcs.

---

## Tổng Kết

| Thành phần | Trạng thái | Effort |
|---|---|---|
| Đường trục ngang (parent multi-arc) | ✅ Đã implement | — |
| Z-order: trục dưới, chấm trên | ✅ Đã đúng | — |
| Nét đứt cho gap giữa segments | ⬜ Chưa (optional) | ~1 giờ |
| Start/End tick marks | ⬜ Chưa (optional) | ~15 phút |
| Conditional cho bar mode | ⬜ Chưa (khi có bar mode) | ~5 phút |
| Conditional cho multi-team | ⬜ Chưa (khi có multi-team) | ~10 phút |

## Files Đã Sửa

| File | Thay đổi |
|------|---------|
| `src/components/SpreadsheetGrid.tsx` | Thêm `<line>` SVG tại baseline trong block multi-arc parent (lines 2599-2618) |

## Không Thay Đổi

- `TimelineArc.tsx` — giữ nguyên
- `timelineArc.ts` — giữ nguyên
- Types, API, Database — không ảnh hưởng
