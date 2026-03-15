# Plan: Inline Note Input trong Image Preview Sidebar

## Mục tiêu

Cho phép user **nhập và lưu note trực tiếp** trong Image Preview sidebar (sidebar bên phải) mà không cần mở Full Edit popup.

---

## Phân tích hiện trạng

| Thành phần | Hiện trạng |
|---|---|
| Note section trong sidebar | Chỉ **read-only** — hiển thị `activeImagePreviewNote` nếu có |
| Quick Note popup riêng | Đã có state `quickNoteDraft`, `handleQuickNoteSave` — dùng cho popup khác (`activeNotePreview`) |
| Save inline | `updateActivePreviewItemWithSaveFeedback` đã có, dùng cho Status/Week |
| Save feedback UI | `viewerInlineSaveFeedback` đã có — hiển thị "Đang lưu..." và tick confirm |

---

## Giải pháp đề xuất

**Thêm 1 state draft riêng cho Image Preview sidebar** (`imagePreviewNoteDraft`), thay thế phần Note read-only bằng `<textarea>` có thể edit. Lưu khi user blur hoặc bấm nút Save.

---

## Thứ tự thay đổi trong `SpreadsheetGrid.tsx`

### 1. Thêm state

```typescript
const [imagePreviewNoteDraft, setImagePreviewNoteDraft] = useState('');
```

### 2. Sync draft khi activeImagePreviewId thay đổi

```typescript
useEffect(() => {
    setImagePreviewNoteDraft(
        activeImagePreviewItem?.quickNote?.trim() || ''
    );
}, [activeImagePreviewItem?.id]);
```

> Dùng `.id` (không dùng `activeImagePreviewItem` object) để tránh re-sync khi item update giữa chừng.

### 3. Thêm handler save

```typescript
const handleImagePreviewNoteSave = () => {
    const trimmed = imagePreviewNoteDraft.trim();
    const current = activeImagePreviewItem?.quickNote || '';
    if (trimmed === current.trim()) return; // không dirty, không save
    updateActivePreviewItemWithSaveFeedback(source => {
        const next = { ...source };
        if (trimmed.length > 0) next.quickNote = trimmed;
        else delete next.quickNote;
        return next;
    });
};
```

### 4. Thay thế Note section trong sidebar

**Trước (read-only):**
```tsx
{activeImagePreviewNote && (
    <div>
        <p className="...">Note</p>
        <div className="...">
            <p>{activeImagePreviewNote}</p>
        </div>
    </div>
)}
```

**Sau (editable textarea):**
```tsx
<div>
    <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Note</p>
        <span className="text-[10px] text-slate-400">
            {imagePreviewNoteDraft.length}/{MAX_QUICK_NOTE_LENGTH}
        </span>
    </div>
    <textarea
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5
                   text-[12px] leading-relaxed text-slate-700 resize-none
                   focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200
                   disabled:opacity-60"
        rows={4}
        maxLength={MAX_QUICK_NOTE_LENGTH}
        value={imagePreviewNoteDraft}
        placeholder="Thêm ghi chú..."
        onChange={e => setImagePreviewNoteDraft(e.target.value.slice(0, MAX_QUICK_NOTE_LENGTH))}
        onBlur={handleImagePreviewNoteSave}
        disabled={!canEdit}
    />
</div>
```

> **Save khi blur** — không cần thêm nút Save riêng; consistent với UX hiện tại của sidebar (Status, Week cũng lưu ngay khi chọn). Nếu muốn có nút Save thì có thể thêm sau.

---

## File bị ảnh hưởng

| File | Thay đổi |
|---|---|
| `src/components/SpreadsheetGrid.tsx` | Thêm state, useEffect, handler, cập nhật JSX Note section |

---

## Verification

1. Build: `npm run build`
2. Manual test:
   - Mở Image Preview sidebar → thấy `<textarea>` dưới mục Note
   - Nhập text → blur → hiện "Đang lưu..." → biến mất
   - Reload → note vẫn còn
   - Mở Full Edit → Quick Note khớp với nội dung vừa nhập
   - Item chưa có note → textarea trống, placeholder "Thêm ghi chú..."
   - `canEdit = false` (viewer mode) → textarea bị disabled
