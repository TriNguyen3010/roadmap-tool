# Arc/Curve Timeline Style - Implementation Plan

**Ngày tạo:** 2026-04-02
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript + Supabase)
**Mục đích:** Thay đổi timeline từ dạng bar (thanh ngang) sang dạng arc/curve (đường cong) cho tất cả items

---

## Phân Tích Hiện Trạng

### Timeline hiện tại (Bar style)

```
Row: Fix login bug
Timeline: │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   ← div absolute, backgroundColor, rounded
          Start              End
```

**Cách render:**
- Dùng HTML `<div>` với `position: absolute`
- Tính `left` và `width` từ index của timelineUnits
- `backgroundColor` lấy từ `STATUS_BAR_COLOR[status]`
- Child segments = nhiều div chồng trong 1 container
- Chiều cao bar: `top-[4px] bottom-[4px]` (lấp đầy row 28px)

**Vấn đề với bar:**
- Khi nhiều child segments chồng nhau → khó đọc
- Bar đặc, không phân biệt rõ đâu là start/end
- Trông nặng nề khi nhiều items

### Timeline mới (Arc style)

```
Row: Fix login bug
                  ╭─────────╮
                 ╱           ╲
Timeline: ──────●─────────────●──────
              Start          End
              P.D.S         P.D.D
```

**Ưu điểm:**
- Trực quan: thấy rõ điểm start và end
- Nhiều arcs trên 1 row → phân biệt bằng chiều cao khác nhau
- Nhẹ nhàng, hiện đại hơn bar đặc
- Dễ nhận biết phase nào đang active

---

## Tổng Quan Phases

| Phase | Nội Dung | Thời Gian | Dependencies |
|-------|---------|-----------|-------------|
| **Phase 1** | SVG Arc Component + Rendering Logic | 3-4 giờ | — |
| **Phase 2** | Thay thế bar rendering trong SpreadsheetGrid | 2-3 giờ | Phase 1 |
| **Phase 3** | Multi-arc (child segments) + Chiều cao dynamic | 2-3 giờ | Phase 2 |
| **Phase 4** | Interactions (click, hover, tooltip) | 1-2 giờ | Phase 2 |
| **Phase 5** | Testing & QA | 1-2 giờ | Phase 3, 4 |
| **Total** | | **9-14 giờ** | |

---

---

# PHASE 1: SVG Arc Component + Rendering Logic

**Mục tiêu:** Tạo component vẽ 1 arc (đường cong) giữa 2 điểm trên timeline.

**Trạng thái:** 🔲 Chưa bắt đầu

### 1.1 Nguyên Lý Vẽ Arc bằng SVG

Dùng SVG `<path>` với **Quadratic Bezier Curve** (`Q` command):

```
M x1,y1  Q cx,cy  x2,y2

M  = Move to (điểm start)
Q  = Quadratic Bezier (control point + điểm end)
```

```
         (cx, cy) ← control point (giữa, phía trên)
            *
           / \
          /   \
         /     \
(x1,y1) ●       ● (x2,y2)
       Start    End
```

**Công thức:**
- `x1` = pixel position của Start Date
- `x2` = pixel position của End Date
- `cx` = (x1 + x2) / 2 (giữa 2 điểm)
- `cy` = chiều cao arc (càng rộng → càng cao)
- `y1` = `y2` = baseline (giữa row)

### 1.2 Tính Chiều Cao Arc (Dynamic)

Arc ngắn → thấp, arc dài → cao. Giúp tránh chồng lấp khi nhiều arcs trên 1 row:

```typescript
/**
 * Tính chiều cao arc dựa trên khoảng cách giữa start và end.
 * Arc ngắn → thấp (4px), arc dài → cao (tối đa ROW_HEIGHT - 4px).
 */
function calcArcHeight(arcWidth: number, rowHeight: number): number {
  const minHeight = 4;
  const maxHeight = rowHeight - 4;  // 28 - 4 = 24px
  // Scale: arc rộng 1 unit → 4px, rộng full row → maxHeight
  const height = Math.min(maxHeight, Math.max(minHeight, arcWidth * 0.3));
  return height;
}
```

**Ví dụ visual (row height = 28px):**
```
Arc ngắn (2 ngày):    Arc trung bình (7 ngày):    Arc dài (30 ngày):

      ╭╮                    ╭───────╮                 ╭─────────────────╮
      ●●                   ●         ●              ●                     ●
   (cao 4px)            (cao 10px)                (cao 24px)
```

### 1.3 Component: TimelineArc

**File:** `src/components/TimelineArc.tsx` (file mới)

```tsx
'use client';

interface TimelineArcProps {
  x1: number;           // Pixel X của Start Date (tâm dot)
  x2: number;           // Pixel X của End Date (tâm dot)
  color: string;        // Hex color (từ STATUS_BAR_COLOR)
  rowHeight: number;    // Chiều cao row (28px)
  label?: string;       // Label hiện khi hover (optional)
  isActive?: boolean;   // Đang được click/hover
  onClick?: () => void;
}

export function TimelineArc({ x1, x2, color, rowHeight, label, isActive, onClick }: TimelineArcProps) {
  const baseline = rowHeight / 2;  // Đường ngang giữa row
  const arcWidth = Math.abs(x2 - x1);
  const arcHeight = calcArcHeight(arcWidth, rowHeight);
  const dotRadius = 3;

  // Swap nếu x1 > x2
  const startX = Math.min(x1, x2);
  const endX = Math.max(x1, x2);

  // Control point: giữa 2 điểm, phía trên baseline
  const cx = (startX + endX) / 2;
  const cy = baseline - arcHeight;

  // SVG path: Quadratic Bezier
  const pathD = `M ${startX},${baseline} Q ${cx},${cy} ${endX},${baseline}`;

  return (
    <g
      className={`cursor-pointer transition-opacity ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
      onClick={onClick}
    >
      {/* Arc curve */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isActive ? 2.5 : 1.8}
        strokeLinecap="round"
      />

      {/* Start dot */}
      <circle
        cx={startX}
        cy={baseline}
        r={dotRadius}
        fill={color}
      />

      {/* End dot */}
      <circle
        cx={endX}
        cy={baseline}
        r={dotRadius}
        fill={color}
      />

      {/* Hover/active label (tooltip) */}
      {isActive && label && (
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="text-[9px] font-bold fill-gray-700 pointer-events-none select-none"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function calcArcHeight(arcWidth: number, rowHeight: number): number {
  const minHeight = 4;
  const maxHeight = rowHeight - 4;
  return Math.min(maxHeight, Math.max(minHeight, arcWidth * 0.3));
}
```

### 1.4 Ví Dụ Render

```tsx
<svg width={timelineTotalWidth} height={28} className="absolute top-0 left-0">
  <TimelineArc
    x1={120}       // Start date pixel
    x2={320}       // End date pixel
    color="#3b82f6" // Blue (FE Start)
    rowHeight={28}
    label="FE Start → FE Done"
  />
</svg>
```

### 1.5 Checklist Phase 1

- [ ] Tạo file `src/components/TimelineArc.tsx`
- [ ] Implement SVG path với Quadratic Bezier
- [ ] Implement `calcArcHeight()` — chiều cao dynamic
- [ ] Dots ở 2 đầu (start/end)
- [ ] Hover/active state (opacity, strokeWidth thay đổi)
- [ ] TypeScript compile không lỗi
- [ ] Test render 1 arc đơn lẻ

---

---

# PHASE 2: Thay Thế Bar Rendering trong SpreadsheetGrid

**Mục tiêu:** Đổi từ div-based bars sang SVG-based arcs trong timeline area.

**Trạng thái:** 🔲 Chưa bắt đầu
**Phụ thuộc:** Phase 1

### 2.1 Thay Đổi Kiến Trúc Render

**Hiện tại (div-based):**
```
<div className="relative" style={{ height: 28 }}>  ← Row container
  <div style={{ left: barLeft, width: barWidth, ... }} />  ← Bar (absolute div)
</div>
```

**Sau (SVG-based):**
```
<div className="relative" style={{ height: 28 }}>  ← Row container (giữ nguyên)
  <svg width={timelineTotalWidth} height={28}        ← SVG overlay (mới)
       className="absolute top-0 left-0 pointer-events-none">
    <TimelineArc x1={...} x2={...} color={...} />   ← Arc component
  </svg>
</div>
```

### 2.2 Tính Toán x1, x2 từ Code Hiện Tại

Code hiện tại đã tính `barLeft` và `barWidth`. Chuyển đổi sang x1/x2:

```typescript
// Hiện tại:
// barLeft  = timelineLeftOffset + firstIdx * timelineUnitWidth
// barWidth = (lastIdx - firstIdx + 1) * timelineUnitWidth

// Chuyển sang arc:
const x1 = timelineLeftOffset + firstIdx * timelineUnitWidth + timelineUnitWidth / 2;
// ↑ tâm dot start = giữa unit đầu tiên

const x2 = timelineLeftOffset + lastIdx * timelineUnitWidth + timelineUnitWidth / 2;
// ↑ tâm dot end = giữa unit cuối cùng
```

**Giải thích:**
```
Unit 0     Unit 1     Unit 2     Unit 3
|   26px  |   26px  |   26px  |   26px  |
     ●                              ●
   x1=13                         x2=91
   (giữa unit 0)             (giữa unit 3)
```

### 2.3 Thay Thế Single Bar

**File:** `src/components/SpreadsheetGrid.tsx`

Tìm đoạn render single bar (khoảng dòng 2650-2674) và thay thế:

```tsx
{/* ── TRƯỚC: Single bar (div) ── */}
{barLeft >= 0 && (
  <div
    className="absolute top-[4px] bottom-[4px] rounded shadow-sm ..."
    style={{ left: barLeft, width: barWidth, backgroundColor: barColor, opacity: 0.9 }}
  >
    {/* ... tooltip, label ... */}
  </div>
)}

{/* ── SAU: Single arc (SVG) ── */}
{barLeft >= 0 && (
  <svg
    width={timelineTotalWidth}
    height={ROW_HEIGHT}
    className="absolute top-0 left-0 overflow-visible"
    style={{ zIndex: hasActiveInfo ? 150 : 5 }}
  >
    <TimelineArc
      x1={timelineLeftOffset + firstIdx * timelineUnitWidth + timelineUnitWidth / 2}
      x2={timelineLeftOffset + lastIdx * timelineUnitWidth + timelineUnitWidth / 2}
      color={barColor}
      rowHeight={ROW_HEIGHT}
      label={`${row.name} · ${row.status}`}
      isActive={hasActiveInfo}
      onClick={() => setActiveBarInfoId(prev => prev === row.id ? null : row.id)}
    />
  </svg>
)}
```

### 2.4 Xử Lý Items Chỉ Có 1 Ngày (startDate = endDate)

Khi start = end, arc sẽ collapse thành 1 điểm. Thay vì arc, hiện **1 dot lớn hơn**:

```tsx
// Trong TimelineArc, check:
if (Math.abs(x2 - x1) < 2) {
  // Render single dot thay vì arc
  return (
    <g>
      <circle cx={x1} cy={baseline} r={5} fill={color} opacity={0.9} />
    </g>
  );
}
```

### 2.5 Giữ Lại Background Overlays

Các overlay sau **không thay đổi** (vẫn dùng div):
- Today indicator (đường đỏ dọc)
- Milestone shading (background màu nhẹ)
- Weekend shading (tím nhạt)

Chỉ thay đổi **bars → arcs**.

### 2.6 Checklist Phase 2

- [ ] Thêm `<svg>` overlay vào timeline area cho mỗi row
- [ ] Chuyển đổi `barLeft/barWidth` → `x1/x2` (tâm dots)
- [ ] Thay single bar div bằng `<TimelineArc>`
- [ ] Xử lý items 1 ngày (single dot)
- [ ] Giữ nguyên today/milestone/weekend overlays
- [ ] Verify: arcs hiển thị đúng vị trí trên timeline
- [ ] Verify: arcs đúng màu theo STATUS_BAR_COLOR
- [ ] Verify: 3 timeline modes (day/week/month) đều hoạt động

---

---

# PHASE 3: Multi-Arc (Child Segments) + Chiều Cao Dynamic

**Mục tiêu:** Khi parent row có nhiều children (PD, FE, QC...), render nhiều arcs với chiều cao khác nhau để tránh chồng lấp.

**Trạng thái:** 🔲 Chưa bắt đầu
**Phụ thuộc:** Phase 2

### 3.1 Phân Tích

Hiện tại, parent rows (category, subcategory, group) render multi-segment bars:

```
TRƯỚC (multi bar chồng):
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  PD   │   FE    │   QC   │           │  ← Segments chồng trong 1 bar
```

```
SAU (multi arc khác chiều cao):
         ╭───────────────────────────────────────╮  ← PD arc (dài nhất → cao nhất)
        ╱                  ╭──────────╮           ╲
       ╱                  ╱  QC (ngắn) ╲           ╲
──────●──────────────────●──────────────●───────────●────
    PD.S              FE.S/QC.S       QC.D       PD.D
```

### 3.2 Thuật Toán Sắp Xếp Chiều Cao

Arcs được sort theo **width (khoảng cách start→end)**:
- Arc rộng nhất → cao nhất (vòng ngoài)
- Arc hẹp nhất → thấp nhất (vòng trong)

Giúp arcs lồng nhau không bị che:

```typescript
/**
 * Sắp xếp arcs theo width giảm dần.
 * Arc rộng nhất sẽ có chiều cao lớn nhất (vòng ngoài).
 */
function sortArcsByWidth(arcs: ArcData[]): ArcData[] {
  return [...arcs].sort((a, b) => {
    const widthA = Math.abs(a.x2 - a.x1);
    const widthB = Math.abs(b.x2 - b.x1);
    return widthB - widthA;  // Rộng nhất trước
  });
}
```

### 3.3 Tính Chiều Cao Theo Layer

Khi có N arcs trên 1 row, chia đều chiều cao:

```typescript
/**
 * Tính chiều cao cho mỗi arc trong group.
 * Arc ở index 0 (rộng nhất) → cao nhất.
 * Arc ở index N-1 (hẹp nhất) → thấp nhất.
 */
function calcLayeredArcHeight(
  index: number,
  total: number,
  rowHeight: number
): number {
  const maxHeight = rowHeight - 4;   // 24px
  const minHeight = 6;
  const step = (maxHeight - minHeight) / Math.max(total - 1, 1);
  return maxHeight - index * step;
  // index 0 → 24px (ngoài cùng)
  // index 1 → 18px
  // index 2 → 12px
  // index 3 → 6px  (trong cùng)
}
```

**Visual ví dụ (4 arcs):**
```
   ╭──────────────────────────────────────────╮    arc 0: height = 24px
  ╱    ╭────────────────────────────╮          ╲   arc 1: height = 18px
 ╱    ╱     ╭──────────────╮        ╲          ╲   arc 2: height = 12px
╱    ╱     ╱    ╭────╮      ╲        ╲          ╲  arc 3: height = 6px
●    ●     ●    ●    ●      ●        ●          ●
BA.S FE.S QC.S PD.S PD.D  QC.D    FE.D       BA.D
```

### 3.4 Chuyển Đổi childSegments → childArcs

Code hiện tại build `childSegments[]` array. Chuyển đổi:

```typescript
interface ArcData {
  x1: number;
  x2: number;
  color: string;
  status: string;
  childName: string;
}

// Chuyển từ childSegments (left, width) → ArcData (x1, x2)
const childArcs: ArcData[] = childSegments.map(seg => ({
  x1: seg.left + timelineUnitWidth / 2,      // tâm dot start
  x2: seg.left + seg.width - timelineUnitWidth / 2,  // tâm dot end
  color: seg.color,
  status: seg.status,
  childName: seg.childName,
}));

// Sort theo width giảm dần
const sortedArcs = sortArcsByWidth(childArcs);
```

### 3.5 Render Multi-Arc

```tsx
{/* Multi-arc cho parent row */}
{hasChildSegments && (
  <svg
    width={timelineTotalWidth}
    height={ROW_HEIGHT}
    className="absolute top-0 left-0 overflow-visible"
  >
    {sortedArcs.map((arc, index) => (
      <TimelineArc
        key={index}
        x1={arc.x1}
        x2={arc.x2}
        color={arc.color}
        rowHeight={ROW_HEIGHT}
        arcHeight={calcLayeredArcHeight(index, sortedArcs.length, ROW_HEIGHT)}
        label={`${arc.childName} · ${arc.status}`}
        isActive={activeBarInfoId === row.id}
        onClick={() => setActiveBarInfoId(prev => prev === row.id ? null : row.id)}
      />
    ))}
  </svg>
)}
```

**Cần update `TimelineArc` để nhận `arcHeight` prop (override auto-calc):**

```typescript
// Thêm vào TimelineArcProps:
arcHeight?: number;  // Override chiều cao (cho layered mode)

// Trong component:
const height = arcHeight ?? calcArcHeight(arcWidth, rowHeight);
const cy = baseline - height;
```

### 3.6 Checklist Phase 3

- [ ] Tạo `sortArcsByWidth()` utility
- [ ] Tạo `calcLayeredArcHeight()` utility
- [ ] Update `TimelineArc` — thêm `arcHeight` prop
- [ ] Chuyển `childSegments` → `childArcs` (ArcData[])
- [ ] Render multi-arc cho parent rows
- [ ] Verify: arcs lồng nhau không bị che
- [ ] Verify: arc rộng nhất ở ngoài, hẹp nhất ở trong
- [ ] Verify: hoạt động với 1, 2, 3, 5+ child arcs

---

---

# PHASE 4: Interactions (Click, Hover, Tooltip)

**Mục tiêu:** Click vào arc hiện tooltip chi tiết, hover highlight.

**Trạng thái:** 🔲 Chưa bắt đầu
**Phụ thuộc:** Phase 2

### 4.1 Hover Effects

```tsx
{/* Trong TimelineArc — hover style */}
<path
  d={pathD}
  fill="none"
  stroke={color}
  strokeWidth={isActive ? 2.5 : 1.8}
  strokeLinecap="round"
  className="transition-all duration-150"
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
  style={{
    filter: hovered ? `drop-shadow(0 0 3px ${color})` : 'none',
  }}
/>

{/* Dots lớn hơn khi hover */}
<circle
  cx={startX} cy={baseline} r={hovered ? 4 : 3}
  fill={color}
  className="transition-all duration-150"
/>
```

### 4.2 Click Tooltip (Info Popup)

Giữ nguyên logic `activeBarInfoId` hiện tại. Khi click arc → hiện popup info:

```tsx
{/* Tooltip khi click arc */}
{isActive && (
  <foreignObject x={cx - 80} y={cy - 50} width={160} height={45}>
    <div className="bg-gray-900/90 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap shadow-md">
      <div>{row.name}</div>
      <div>{row.startDate} → {row.endDate}</div>
      <div>{row.status} · {row.progress}%</div>
    </div>
  </foreignObject>
)}
```

**Lưu ý:** Dùng `<foreignObject>` trong SVG để render HTML tooltip (giống style hiện tại).

### 4.3 Hover trên Dot → Hiện Ngày

Khi hover vào dot start hoặc end, hiện nhỏ ngày:

```tsx
{/* Start dot với date label khi hover */}
<g onMouseEnter={() => setHoveredDot('start')} onMouseLeave={() => setHoveredDot(null)}>
  <circle cx={startX} cy={baseline} r={3} fill={color} />
  {hoveredDot === 'start' && (
    <text x={startX} y={baseline + 12} textAnchor="middle"
          className="text-[8px] fill-gray-500 pointer-events-none">
      {startDateLabel}
    </text>
  )}
</g>
```

### 4.4 Checklist Phase 4

- [ ] Hover effect: arc glow + dots lớn hơn
- [ ] Click: tooltip hiện info (name, dates, status, progress)
- [ ] Hover dot: hiện date label nhỏ
- [ ] Transition mượt (CSS transition)
- [ ] Click outside: dismiss tooltip
- [ ] Verify: pointer-events hoạt động đúng trên SVG

---

---

# PHASE 5: Testing & QA

**Mục tiêu:** Đảm bảo arc timeline hoạt động chính xác ở mọi trường hợp.

**Trạng thái:** 🔲 Chưa bắt đầu
**Phụ thuộc:** Phase 3, 4

### 5.1 Unit Tests

**File:** `src/__tests__/timelineArc.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { calcArcHeight, calcLayeredArcHeight, sortArcsByWidth } from '../utils/arcHelpers';

describe('calcArcHeight', () => {
  it('arc ngắn → chiều cao thấp', () => {
    expect(calcArcHeight(10, 28)).toBeLessThan(10);
  });

  it('arc dài → chiều cao cao', () => {
    expect(calcArcHeight(200, 28)).toBe(24); // maxHeight
  });

  it('không vượt quá maxHeight', () => {
    expect(calcArcHeight(9999, 28)).toBe(24);
  });
});

describe('calcLayeredArcHeight', () => {
  it('index 0 (rộng nhất) → cao nhất', () => {
    const h0 = calcLayeredArcHeight(0, 3, 28);
    const h1 = calcLayeredArcHeight(1, 3, 28);
    const h2 = calcLayeredArcHeight(2, 3, 28);
    expect(h0).toBeGreaterThan(h1);
    expect(h1).toBeGreaterThan(h2);
  });
});

describe('sortArcsByWidth', () => {
  it('sort rộng nhất trước', () => {
    const arcs = [
      { x1: 0, x2: 50, color: '', status: '', childName: '' },
      { x1: 0, x2: 200, color: '', status: '', childName: '' },
      { x1: 0, x2: 100, color: '', status: '', childName: '' },
    ];
    const sorted = sortArcsByWidth(arcs);
    expect(sorted[0].x2).toBe(200);
    expect(sorted[1].x2).toBe(100);
    expect(sorted[2].x2).toBe(50);
  });
});
```

### 5.2 Manual QA Checklist

**Rendering cơ bản:**
- [ ] Single arc hiển thị đúng từ start → end
- [ ] Dots ở đúng vị trí (giữa unit start / unit end)
- [ ] Màu đúng theo `STATUS_BAR_COLOR`
- [ ] Arc vẽ phía trên baseline (cong lên)

**Multi-arc (parent rows):**
- [ ] Parent có 2 children → 2 arcs chiều cao khác nhau
- [ ] Parent có 5+ children → arcs lồng nhau đúng thứ tự
- [ ] Arc rộng nhất ở ngoài cùng (cao nhất)
- [ ] Arc hẹp nhất ở trong cùng (thấp nhất)
- [ ] Arcs không bị cắt bởi row boundary

**Timeline modes:**
- [ ] Day mode (26px/unit) → arcs hiển thị đúng
- [ ] Week mode (46px/unit) → arcs hiển thị đúng
- [ ] Month mode (64px/unit) → arcs hiển thị đúng

**Edge cases:**
- [ ] Item chỉ có 1 ngày (start = end) → hiện single dot
- [ ] Item không có date → không render gì
- [ ] Item rất dài (30+ ngày) → arc không vượt quá row height
- [ ] Item rất ngắn (1-2 ngày) → arc vẫn visible, không quá nhỏ
- [ ] Zoom/scroll → arcs theo đúng vị trí

**Interactions:**
- [ ] Hover arc → glow effect + dots lớn hơn
- [ ] Click arc → tooltip hiện (name, dates, status)
- [ ] Hover dot → hiện date label
- [ ] Click outside → dismiss tooltip
- [ ] Growth Camp items → vẫn có visual indicator (emoji hoặc style khác)

**Performance:**
- [ ] 50+ rows với arcs → không lag render
- [ ] Scroll mượt
- [ ] SVG elements không gây memory leak

**Overlays (không bị ảnh hưởng):**
- [ ] Today indicator (đường đỏ) vẫn hiện
- [ ] Milestone shading vẫn hoạt động
- [ ] Weekend shading vẫn hoạt động

---

---

# Tổng Kết Kỹ Thuật

### Thay Đổi Files

| File | Thay đổi |
|------|---------|
| `src/components/TimelineArc.tsx` | **MỚI** — SVG arc component |
| `src/utils/arcHelpers.ts` | **MỚI** — calcArcHeight, calcLayeredArcHeight, sortArcsByWidth |
| `src/components/SpreadsheetGrid.tsx` | **SỬA** — Thay div bars bằng SVG arcs |
| `src/__tests__/timelineArc.test.ts` | **MỚI** — Unit tests |

### Không Thay Đổi

- Database / Supabase schema
- RoadmapItem type
- API routes
- Other components (EditPopup, Toolbar, FilterPopup...)
- STATUS_BAR_COLOR mapping (giữ nguyên colors)
- Position calculation logic (giữ nguyên index → pixel)
- Timeline unit generation (day/week/month)

### Dependencies Mới

Không cần install thêm library. Dùng **native SVG** trong React.

---

## Lưu Ý

- **SVG `overflow: visible`:** Cần set trên `<svg>` element để arcs cao không bị crop.
- **pointer-events:** SVG path mặc định chỉ detect click trên stroke, không phải fill. Có thể thêm `pointerEvents="stroke"` hoặc thêm invisible wider path cho easier clicking.
- **Performance:** SVG với 50-100 `<path>` elements hoạt động tốt. Nếu 500+ rows, cân nhắc virtualization (chỉ render visible rows — hiện tại Grid đã virtualize chưa cần kiểm tra).
- **Accessibility:** Thêm `<title>` element trong SVG group cho screen readers.
- **Fallback:** Có thể giữ option toggle giữa bar/arc style trong settings nếu muốn.
