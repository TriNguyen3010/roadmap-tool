# Plan: Hiển thị indicator "có note" trên card

## Mục tiêu

Nhìn vào grid card, user biết ngay card nào có ghi chú mà không cần bấm vào từng cái.

---

## Giải pháp đề xuất: Note badge ở góc ảnh

Thêm một **badge nhỏ** vào khu vực ảnh của card (giống badge `+N ảnh` đã có ở góc trên phải):

```
📝  — icon note ở góc trên trái, khi card có quickNote
```

**Vị trí:** Góc **trên trái** của ảnh (badge `+N` đã ở góc trên phải, nên không xung đột).

**Visual:**
- Nền đen mờ (`bg-black/60`), icon `MessageSquare` size 10, màu trắng
- Nhỏ gọn, không che nội dung ảnh chính

---

## Thay đổi duy nhất: `SpreadsheetGrid.tsx`

**Thêm 1 dòng check:** `const hasNote = !!card.row.quickNote?.trim();` (ngay dưới `const hasImage`).

**Thêm JSX vào trong `<div className="relative overflow-hidden rounded-t-xl">` — ngay sau close tag image area:**

```tsx
{hasNote && (
    <span
        className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5"
        title="Có ghi chú"
    >
        <MessageSquare size={9} className="text-white" />
    </span>
)}
```

> `MessageSquare` đã được import sẵn trong file (kiểm tra lại trước khi implement).

---

## Phạm vi ảnh hưởng

| File | Thay đổi |
|---|---|
| `src/components/SpreadsheetGrid.tsx` | ~3 dòng: thêm 1 biến + 1 JSX block |

---

## Verification

1. `npm run build`
2. Mở app → Reported mode → xem card có note → thấy icon 📝 góc trên trái
3. Card không có note → không thấy icon
4. Hover vào icon → tooltip "Có ghi chú"
