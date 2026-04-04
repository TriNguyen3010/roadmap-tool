# Timeline Bar Mode (Gantt-style) — Implementation Plan

**Ngày tạo:** 2026-04-04
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript + Supabase)
**Mục đích:** Thêm mode hiển thị timeline dạng thanh ngang Gantt thay thế cho arc cong hiện tại. User toggle qua nút trên Toolbar.

> **Cross-dependency:** Plan này độc lập với team-permission-plan và multi-team-concurrent-editing-plan.
> Nếu triển khai cùng multi-team plan, bar mode cũng hiển thị multi-team bars (mỗi team 1 bar) giống multi-team arcs.

---

## Hiện Trạng

### Timeline Arc hiện tại

```
  ╭───────────────╮         ← SVG quadratic Bézier curve
  ●               ●         ← endpoint dots (radius 3-3.4px)
  ╰───────────────╯
  │← barLeft      →│barWidth
```

- Component: `TimelineArc.tsx` — SVG `<path>` với `M startX,baseline Q midX,controlY endX,baseline`
- Baseline: `rowHeight - 6` = 22px (với ROW_HEIGHT = 28)
- Arc height: `min(rowH - 10, max(6, arcWidth * 0.18))`
- Màu: `STATUS_BAR_COLOR[status]` — 25+ màu theo status
- Parent items: layered arcs (nhiều arc chồng nhau, giảm dần height)
- Single-day items: chấm tròn thay vì arc

### Positioning đã có sẵn

SpreadsheetGrid.tsx đã tính `barLeft` và `barWidth` cho mỗi row:

```typescript
barLeft = timelineLeftOffset + firstIdx * timelineUnitWidth;
barWidth = (lastIdx - firstIdx + 1) * timelineUnitWidth;
```

Và `childSegments` cho parent items:

```typescript
childSegments.push({
  left, width, color, status, childName, startDate, endDate, isSingleDay
});
```

**Điểm quan trọng:** Logic tính vị trí + kích thước bar **không cần thay đổi**. Chỉ cần thay phần render từ `<TimelineArc>` sang `<TimelineBar>`.

---

## Thiết Kế

### Gantt Bar style

```
┌─────────────────────────┐
│█████████████████████████│  ← Thanh đặc, bo góc, màu theo status
└─────────────────────────┘
 ↑ barLeft                 ↑ barLeft + barWidth
 │                         │
 height: 14px (leaf item)
 height: 10px (child bar trong parent)
 border-radius: 3px
```

### Parent item — stacked bars

```
┌──────────────────┐              ← FE bar (xanh dương)
└──────────────────┘
   ┌─────────────────────────┐    ← BE bar (xanh lá)
   └─────────────────────────┘
      ┌─────────┐                 ← QC bar (hồng)
      └─────────┘

 Mỗi child bar cao 8px, gap 2px giữa các bars
 Tổng = N * 8 + (N-1) * 2 + padding
```

### Single-day item

```
  ◆          ← Diamond marker (6x6px) thay vì dot tròn
```

### So sánh Arc vs Bar

| Thuộc tính | Arc Mode | Bar Mode |
|---|---|---|
| Hình dạng | Đường cong Bézier | Thanh chữ nhật bo góc |
| Chiều cao leaf | Dynamic (6-18px) | Cố định 14px |
| Chiều cao child | Layered giảm dần | Stacked đều 8px |
| Single-day | Chấm tròn | Diamond ◆ |
| Active state | Glow + stroke dày hơn | Glow + border highlight |
| Opacity | 0.88 / 1.0 | 0.85 / 1.0 |
| Growth Camp dash | strokeDasharray="4 3" | Repeating gradient stripes |

---

## Kỹ Thuật

### Phase 1: Data Model & Settings (0.5 giờ)

#### 1.1 Thêm timeline display mode

**File:** `src/types/roadmap.ts`

```typescript
export type TimelineDisplayMode = 'arc' | 'bar';
```

#### 1.2 Thêm vào RoadmapViewSettings

```typescript
export interface RoadmapViewSettings {
  // ... existing fields ...
  timelineDisplayMode?: TimelineDisplayMode;  // default: 'arc'
}
```

#### 1.3 Checklist

- [ ] Thêm `TimelineDisplayMode` type
- [ ] Thêm `timelineDisplayMode` vào `RoadmapViewSettings`
- [ ] Verify: save + load giữ đúng giá trị

---

### Phase 2: TimelineBar Component (2-3 giờ)

#### 2.1 Component mới

**File mới:** `src/components/TimelineBar.tsx`

```typescript
interface TimelineBarProps {
  left: number;           // x position trong SVG
  width: number;          // chiều rộng bar
  color: string;          // hex color từ STATUS_BAR_COLOR
  rowHeight: number;      // chiều cao row container
  barHeight?: number;     // chiều cao thanh bar (default: 14)
  yOffset?: number;       // offset y cho stacked bars (default: auto-center)
  isActive: boolean;      // hover/selected state
  isSingleDay?: boolean;  // render diamond thay vì bar
  isDashed?: boolean;     // Growth Camp style — stripe pattern
  opacity?: number;       // 0.85 default, 1.0 khi active
  label?: string;         // Text ngắn hiển thị trong bar (vd: "5d" hoặc team name)
}

export default function TimelineBar({
  left, width, color, rowHeight,
  barHeight = 14,
  yOffset,
  isActive,
  isSingleDay = false,
  isDashed = false,
  opacity = 0.85,
  label,
}: TimelineBarProps) {
  // Center vertically nếu không có yOffset
  const y = yOffset ?? Math.round((rowHeight - barHeight) / 2);
  const activeOpacity = isActive ? 1.0 : opacity;
  const radius = Math.min(3, barHeight / 2);

  if (isSingleDay) {
    // Diamond marker
    const cx = left + width / 2;
    const cy = y + barHeight / 2;
    const size = Math.min(6, barHeight * 0.6);
    return (
      <svg width={width} height={rowHeight} style={{ overflow: 'visible' }}>
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          fill={color}
          opacity={activeOpacity}
        />
        {isActive && (
          <polygon
            points={`${cx},${cy - size - 1} ${cx + size + 1},${cy} ${cx},${cy + size + 1} ${cx - size - 1},${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={1}
            opacity={0.3}
          />
        )}
      </svg>
    );
  }

  return (
    <svg width={width} height={rowHeight} style={{ overflow: 'visible' }}>
      {/* Drop shadow for active */}
      {isActive && (
        <defs>
          <filter id={`bar-glow-${left}`} x="-10%" y="-30%" width="120%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor={color} floodOpacity="0.3" />
          </filter>
        </defs>
      )}

      {/* Main bar */}
      <rect
        x={0}
        y={y}
        width={Math.max(width, 4)}
        height={barHeight}
        rx={radius}
        ry={radius}
        fill={isDashed ? 'url(#stripe-pattern)' : color}
        opacity={activeOpacity}
        filter={isActive ? `url(#bar-glow-${left})` : undefined}
      />

      {/* Dashed stripe pattern for Growth Camp */}
      {isDashed && (
        <defs>
          <pattern id="stripe-pattern" patternUnits="userSpaceOnUse"
                   width="8" height="8" patternTransform="rotate(45)">
            <rect width="4" height="8" fill={color} opacity={activeOpacity} />
            <rect x="4" width="4" height="8" fill={color} opacity={activeOpacity * 0.4} />
          </pattern>
        </defs>
      )}

      {/* Active border */}
      {isActive && (
        <rect
          x={0.5}
          y={y + 0.5}
          width={Math.max(width - 1, 3)}
          height={barHeight - 1}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="white"
          strokeWidth={1}
          opacity={0.5}
        />
      )}

      {/* Label inside bar (optional) */}
      {label && width > 30 && (
        <text
          x={Math.min(6, width * 0.1)}
          y={y + barHeight / 2 + 1}
          fill="white"
          fontSize="9"
          fontWeight="600"
          dominantBaseline="middle"
          opacity={0.9}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
```

#### 2.2 So sánh với TimelineArc API

| Prop | TimelineArc | TimelineBar | Ghi chú |
|---|---|---|---|
| startX/endX | ✅ | ❌ dùng left/width | Bar dùng position + size thay vì 2 endpoints |
| color | ✅ | ✅ | Cùng STATUS_BAR_COLOR |
| rowHeight | ✅ | ✅ | |
| arcHeight | ✅ | ❌ dùng barHeight | Khác concept |
| isActive | ✅ | ✅ | |
| forceDot | ✅ | ❌ dùng isSingleDay | Tương đương |
| strokeDasharray | ✅ | ❌ dùng isDashed | Bar dùng stripe pattern thay vì dash |
| label | ❌ | ✅ MỚI | Hiện text ngắn trong bar |

#### 2.3 Checklist Phase 2

- [ ] Tạo `src/components/TimelineBar.tsx`
- [ ] Render thanh chữ nhật bo góc cho multi-day items
- [ ] Diamond marker cho single-day items
- [ ] Active state: glow + white border
- [ ] Dashed/stripe pattern cho Growth Camp
- [ ] Optional label text bên trong bar
- [ ] Visual tests: bar ở các width khác nhau (nhỏ 4px → lớn 200px+)

---

### Phase 3: Tích Hợp vào SpreadsheetGrid (2-3 giờ)

#### 3.1 Import và conditional render

**File:** `src/components/SpreadsheetGrid.tsx`

```typescript
import TimelineBar from './TimelineBar';

// Trong component, nhận prop:
const timelineDisplayMode: TimelineDisplayMode = settings?.timelineDisplayMode || 'arc';
```

#### 3.2 Render logic — leaf item

Thay thế block render TimelineArc cho leaf items:

```typescript
// Hiện tại (lines ~2700):
<svg width={barWidth} height={ROW_HEIGHT} ...>
  <TimelineArc startX={...} endX={...} color={barColor} ... />
</svg>

// Sau:
{timelineDisplayMode === 'arc' ? (
  <svg width={barWidth} height={ROW_HEIGHT} ...>
    <TimelineArc startX={...} endX={...} color={barColor} ... />
  </svg>
) : (
  <TimelineBar
    left={0}
    width={barWidth}
    color={barColor}
    rowHeight={ROW_HEIGHT}
    isActive={hasActiveInfo}
    isSingleDay={isSingleDayBar}
    isDashed={isGrowthCamp}
    label={workdays > 0 ? `${workdays}d` : undefined}
  />
)}
```

#### 3.3 Render logic — parent multi-segment

```typescript
// Hiện tại: layered arcs (chồng nhau theo height)
// Sau (bar mode): stacked bars (xếp dọc từ trên xuống)

{timelineDisplayMode === 'arc' ? (
  // Existing layered arc rendering...
) : (
  <svg width={segTotalWidth} height={ROW_HEIGHT} style={{ overflow: 'visible' }}>
    {sortedSegments.map((seg, index) => {
      const localLeft = seg.left - segMinLeft;
      const childBarH = 8;
      const gap = 2;
      const totalH = sortedSegments.length * childBarH + (sortedSegments.length - 1) * gap;
      const startY = Math.round((ROW_HEIGHT - totalH) / 2);
      const yPos = startY + index * (childBarH + gap);

      return (
        <TimelineBar
          key={`${row.id}-bar-${seg.childName}-${index}`}
          left={localLeft}
          width={seg.width}
          color={seg.color}
          rowHeight={ROW_HEIGHT}
          barHeight={childBarH}
          yOffset={yPos}
          isActive={hasActiveInfo}
          isSingleDay={seg.isSingleDay}
          label={seg.childName}
        />
      );
    })}
  </svg>
)}
```

#### 3.4 ROW_HEIGHT adjustment cho stacked bars

Khi parent có nhiều children (>3), bars có thể tràn ra ngoài 28px. Cần dynamic row height:

```typescript
const getBarModeRowHeight = (row: FlattenedRow): number => {
  if (timelineDisplayMode !== 'bar') return ROW_HEIGHT;

  // Leaf items: 28px đủ
  if (!row.children || row.children.length === 0) return ROW_HEIGHT;

  // Parents: tính theo số child segments
  const datedChildren = row.children.filter(c => c.startDate && c.endDate);
  if (datedChildren.length <= 2) return ROW_HEIGHT;

  const childBarH = 8;
  const gap = 2;
  const padding = 6;
  return Math.max(ROW_HEIGHT, datedChildren.length * childBarH + (datedChildren.length - 1) * gap + padding);
};
```

#### 3.5 Workday label bên trong bar

```typescript
// Hiện tại workdays đã được tính:
const workdays = countWorkdays(sd, ed);

// Bar mode: hiện "5d" bên trong bar nếu đủ rộng
<TimelineBar
  ...
  label={workdays > 0 ? `${workdays}d` : undefined}
/>
```

#### 3.6 Checklist Phase 3

- [ ] Conditional render: `timelineDisplayMode === 'arc'` → TimelineArc, `'bar'` → TimelineBar
- [ ] Leaf items: single TimelineBar thay TimelineArc
- [ ] Parent items: stacked bars thay layered arcs
- [ ] Dynamic row height cho parent với nhiều children (bar mode)
- [ ] Workday label bên trong bar
- [ ] Verify: bar positioning khớp chính xác với arc positioning (cùng barLeft/barWidth)
- [ ] Verify: tất cả status colors hiển thị đúng
- [ ] Verify: active/hover state hoạt động

---

### Phase 4: Toolbar Toggle (1 giờ)

#### 4.1 Nút toggle Arc ↔ Bar

**File:** `src/components/Toolbar.tsx`

Đặt cạnh nút "Timeline Only" (vì cùng nhóm timeline controls):

```typescript
// Props mới:
timelineDisplayMode: TimelineDisplayMode;
onToggleTimelineDisplayMode: () => void;

// Render:
<button
  type="button"
  onClick={onToggleTimelineDisplayMode}
  title={timelineDisplayMode === 'arc'
    ? 'Chuyển sang Gantt bar'
    : 'Chuyển sang Arc curve'
  }
  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border px-3
    text-xs font-semibold transition-colors
    ${timelineDisplayMode === 'bar'
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`}
>
  {/* Mini bar icon */}
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="3" width="12" height="3" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="3" y="8" width="8" height="3" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>
  Gantt
</button>
```

#### 4.2 Handler trong page.tsx

```typescript
const handleToggleTimelineDisplayMode = useCallback(() => {
  setData(prev => {
    if (!prev) return prev;
    const current = prev.settings?.timelineDisplayMode || 'arc';
    return {
      ...prev,
      settings: {
        ...prev.settings,
        timelineDisplayMode: current === 'arc' ? 'bar' : 'arc',
      },
    };
  });
}, []);
```

#### 4.3 Checklist Phase 4

- [ ] Nút "Gantt" trên Toolbar cạnh "Timeline Only"
- [ ] Toggle `arc` ↔ `bar` khi bấm
- [ ] Active state: indigo background khi bar mode
- [ ] Mini bar icon trong nút
- [ ] Persist setting qua save (đã nằm trong `settings`)
- [ ] Keyboard shortcut (optional): `G` để toggle

---

### Phase 5: Polish & Edge Cases (1-2 giờ)

#### 5.1 Today marker

Hiện tại today line có highlight trên timeline header. Bar mode nên thêm vertical line xuyên qua các bars:

```typescript
{/* Today line — bar mode only */}
{timelineDisplayMode === 'bar' && todayIdx >= 0 && (
  <div
    className="absolute top-0 bottom-0 pointer-events-none"
    style={{
      left: timelineLeftOffset + todayIdx * timelineUnitWidth + timelineUnitWidth / 2,
      width: 1.5,
      backgroundColor: '#ef4444',
      opacity: 0.4,
      zIndex: 5,
    }}
  />
)}
```

#### 5.2 Bar hover tooltip

Arc mode đã có tooltip khi hover. Bar mode cần tương tự:

```
Hover bar:
  "FE in progress — 07/04 → 18/04 (10 ngày làm việc)"
```

#### 5.3 Transition animation

Khi toggle Arc ↔ Bar, thêm CSS transition mượt:

```css
/* Bars fade in, arcs fade out */
.timeline-bar-enter { opacity: 0; transform: scaleY(0.5); }
.timeline-bar-enter-active { opacity: 1; transform: scaleY(1); transition: all 200ms ease-out; }
```

#### 5.4 Print / Export

Khi export hoặc print, giữ mode hiện tại (arc hoặc bar). Không cần logic riêng.

#### 5.5 Milestone lines

Milestone vertical lines hiện tại đã render ở timeline layer. Bar mode không ảnh hưởng — giữ nguyên.

#### 5.6 Checklist Phase 5

- [ ] Today marker vertical line (bar mode)
- [ ] Hover tooltip trên bar
- [ ] Smooth transition khi toggle mode
- [ ] Verify print/export giữ đúng mode
- [ ] Verify milestone lines vẫn hiện đúng

---

### Phase 6: Testing (1 giờ)

#### 6.1 Test scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Toggle Arc → Bar | Tất cả arcs thành bars, cùng vị trí, cùng màu |
| 2 | Toggle Bar → Arc | Bars thành arcs, không mất data |
| 3 | Leaf item bar | Thanh đặc 14px, bo góc, màu theo status |
| 4 | Parent 2 children | 2 bars stacked, 8px mỗi bar, gap 2px |
| 5 | Parent 5+ children | Row height tự tăng, bars không tràn |
| 6 | Single-day item | Diamond marker thay vì bar |
| 7 | Growth Camp item | Stripe pattern thay vì solid |
| 8 | Active/hover | Glow + white border |
| 9 | Workday label | "5d" hiện trong bar khi đủ rộng |
| 10 | Save → reload | Bar mode persist qua save |
| 11 | Timeline mode day/week/month | Bar width thay đổi theo unit width |

#### 6.2 Edge cases

- Bar width < 4px (rất ngắn) → clamp minimum 4px
- Parent có 1 child có dates, 3 children không có → hiện 1 bar
- Item không có startDate hoặc endDate → không hiện bar (giống arc)
- timelineDisplayMode undefined → fallback 'arc' (backward compat)

---

## Tổng Quan

| Phase | Nội Dung | Thời Gian |
|-------|---------|-----------|
| **Phase 1** | Data model: TimelineDisplayMode setting | 0.5 giờ |
| **Phase 2** | TimelineBar component | 2-3 giờ |
| **Phase 3** | Tích hợp SpreadsheetGrid | 2-3 giờ |
| **Phase 4** | Toolbar toggle button | 1 giờ |
| **Phase 5** | Polish: today line, tooltip, animation | 1-2 giờ |
| **Phase 6** | Testing | 1 giờ |
| **Total** | | **7-10 giờ** |

---

## Files Mới

| File | Mô tả |
|------|-------|
| `src/components/TimelineBar.tsx` | Component render Gantt bar (rect + diamond + label) |

## Files Sửa

| File | Thay đổi |
|------|---------|
| `src/types/roadmap.ts` | Thêm `TimelineDisplayMode`, thêm `timelineDisplayMode` vào settings |
| `src/components/SpreadsheetGrid.tsx` | Conditional render Arc/Bar, dynamic row height cho bar stacked mode |
| `src/components/Toolbar.tsx` | Nút "Gantt" toggle |
| `src/app/roadmap/[id]/page.tsx` | Handler toggle, pass setting xuống components |

## Không Thay Đổi

- `TimelineArc.tsx` — giữ nguyên, chỉ conditional skip khi bar mode
- `timelineArc.ts` utils — giữ nguyên
- API endpoints — setting tự persist qua document save
- Database — không thêm table/column
