# Auto Open Calendar Picker Trong Inline Date Popup - Implementation Plan

**Ngày tạo:** 2026-04-02
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript)
**Mục đích:** Khi user click vào ô date trên grid, mini popup mở ra và phần lịch được bung ngay để chỉnh nhanh, không phải bấm thêm vào input/icon calendar.

---

## Phân Tích Hiện Trạng

Hiện tại `DateMiniPopup` đang:

- render `<input type="date">`
- dùng `autoFocus`
- chờ user bấm thêm vào input hoặc icon calendar mới hiện date picker native

Điều này tạo thêm 1 thao tác phụ, đặc biệt khó chịu khi user đang chỉnh nhiều date liên tiếp.

### Code hiện tại

**File:** `src/components/DateMiniPopup.tsx`

```tsx
<input
  type="date"
  value={dateValue}
  onChange={(event) => setDateValue(event.target.value)}
  autoFocus
/>
```

`autoFocus` chỉ đưa focus vào field, không đảm bảo browser mở ngay date picker.

---

## Kỳ Vọng UX

Flow mới:

1. Click vào `Start Date` / `End Date` cell
2. `DateMiniPopup` xuất hiện
3. Calendar native picker tự bung ra ngay nếu browser hỗ trợ
4. User chọn ngày luôn, không cần click thêm

### Fallback kỳ vọng

Nếu browser không cho auto-open native picker:

- input vẫn được focus sẵn
- user chỉ cần bấm `Enter` hoặc bấm vào field 1 lần là dùng được
- không làm popup lỗi hoặc bị kẹt

---

## Scope

### Trong scope

- auto-open date picker native ngay khi mini popup mount
- giữ nguyên flow lưu `OK`, `Xoá ngày`, `ESC`, click outside
- có fallback an toàn cho browser không hỗ trợ `showPicker()`

### Ngoài scope

- không thay native date input bằng custom calendar library
- không thay đổi layout popup
- không thay đổi logic save date

---

## Phương Án Kỹ Thuật

### Cách làm đề xuất

Thêm `ref` cho input trong `DateMiniPopup`, sau đó khi popup mount:

1. focus input
2. nếu browser có `input.showPicker()` thì gọi ngay
3. nếu không có, giữ nguyên focus fallback

Pseudo-code:

```tsx
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  const input = inputRef.current;
  if (!input) return;

  input.focus();

  if (typeof input.showPicker === 'function') {
    requestAnimationFrame(() => {
      try {
        input.showPicker();
      } catch {
        // fallback: chỉ focus thôi
      }
    });
  }
}, []);
```

### Vì sao dùng `requestAnimationFrame`

- chờ popup mount xong và input hiện diện ổn định trên DOM
- giảm khả năng gọi quá sớm khi browser chưa sẵn sàng render picker

### Browser fallback

Một số browser / environment có thể:

- không support `showPicker()`
- hoặc chặn vì không coi đó là user activation hợp lệ

Trong các case đó:

- không throw lỗi ra UI
- vẫn focus input
- popup hoạt động như hiện tại

---

## Phases

| Phase | Nội Dung | Thời Gian |
|------|---------|-----------|
| Phase 1 | Cập nhật `DateMiniPopup` để auto-open calendar | 15-25 phút |
| Phase 2 | QA trên flow inline date edit | 10-15 phút |

---

# PHASE 1: Auto Open Picker

**File:** `src/components/DateMiniPopup.tsx`

## Các bước

- [ ] Thêm `useRef<HTMLInputElement>`
- [ ] Gắn `ref` vào `<input type="date">`
- [ ] Thêm `useEffect` mount-only để:
  - [ ] `focus()`
  - [ ] gọi `showPicker()` nếu có
  - [ ] `try/catch` để tránh lỗi browser
- [ ] Không làm vỡ logic `ESC`, click outside, warning text

## Lưu ý

- Không dùng effect sync setState mới
- Không thay đổi state `dateValue`
- Không dùng thư viện mới

---

# PHASE 2: QA

## Checklist

- [ ] Click cell date -> popup mở và calendar hiện ngay
- [ ] Chọn ngày -> vẫn save qua `OK`
- [ ] Browser không support `showPicker()` -> input vẫn focus, không crash
- [ ] `ESC` vẫn đóng popup
- [ ] Click ngoài popup vẫn đóng
- [ ] Chuyển giữa `Start Date` và `End Date` vẫn mượt

---

## Rủi Ro

### 1. `showPicker()` bị browser chặn

Khả năng có thể xảy ra nếu browser yêu cầu user gesture chặt hơn.

**Cách xử lý:**
- giữ `focus()` làm fallback
- không coi đây là blocker

### 2. Picker mở quá sớm hoặc không ổn định

**Cách xử lý:**
- gọi trong `requestAnimationFrame`
- nếu vẫn không ổn định thì chuyển sang `setTimeout(..., 0)` hoặc trigger từ click origin

---

## Kết Quả Kỳ Vọng

Sau khi hoàn tất:

- Click `18/04/26`
- Popup mở ra
- Calendar date picker bung ngay
- User chọn ngày trực tiếp, không cần click thêm icon lịch

Điều này giúp inline date editing đúng nghĩa là “1 click để vào chỉnh ngày”.
