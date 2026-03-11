# Plan: Làm header trang roadmap theo `Roadmap Main - Coin98` trong file Pencil

## Nguồn chuẩn
- File thiết kế: `design/roadmap-coin98-reskin-v1.pen`
- Frame: `1w2MS` (`Roadmap Main - Coin98`)
- Header node: `3Lejg` (`headerP2`)

## Mục tiêu
- Header runtime của trang roadmap bám theo header trong Pencil.
- Ưu tiên rõ ràng hierarchy: trái là context/mode, phải là action.
- Giữ toàn bộ hành vi đang có (filter, phase, save, settings, editor lock/unlock).

## Cấu trúc header cần bám theo Pencil
1. Left cluster (`zIpdm`)
- `COIN98` (`xTW0H`)
- `Roadmap` (`BAuFa`)
- quick mode tabs (`2tucX`): `Web`, `App`, `Reported Image Review`

2. Right cluster (`UqJ5x`)
- `Editor/Viewer` button
- `Phase`
- `Filter`
- `Save` (primary, màu vàng)
- `Setting`

3. Khung tổng (`3Lejg`)
- height: `72`
- cornerRadius: `14`
- padding: `[12,14]`
- layout: `space_between`, `alignItems:center`

## Chênh lệch hiện tại cần xử lý
1. Toolbar hiện có 3 cụm (left + đồng hồ giữa + right) trong khi Pencil là 2 cụm chính.
2. Document name editable + icon đang chiếm vai trò title, chưa đúng `COIN98 / Roadmap`.
3. `Save` hiện là icon-only, Pencil dùng nút text rõ ràng.
4. `Phase` nhanh đang là dropdown trigger trong cụm trái; Pencil đặt ở cụm action phải.
5. `Settings` hiện là icon-only; Pencil dùng button label `Setting`.
6. Style quick mode tab đang indigo mạnh; Pencil style neutral + rõ active.

## Phạm vi code
1. `src/components/Toolbar.tsx`
- Refactor layout thành 2 cụm đúng bản vẽ.
- Tách style tokens cho header (height/radius/padding/button sizes).
- Giữ behavior hiện tại của nút, chỉ đổi cấu trúc + visual.

2. `src/app/page.tsx`
- Không đổi business logic lớn.
- Chỉ cập nhật props nếu Toolbar cần thêm cờ hiển thị title/brand.

3. `src/app/globals.css` (nếu cần)
- Bổ sung utility class nhẹ cho header token để tránh class Tailwind quá dài.

## Kế hoạch triển khai
### Phase 1 - Layout skeleton
1. Dựng lại container header theo `3Lejg`.
2. Dựng left cluster đúng thứ tự: `COIN98`, `Roadmap`, mode tabs.
3. Dựng right cluster đúng thứ tự: `Editor/Viewer`, `Phase`, `Filter`, `Save`, `Setting`.

### Phase 2 - Mapping behavior
1. Map hành vi quick tabs sang `onToggleQuickViewMode`.
2. Map `Phase` sang phase picker hiện có.
3. Map `Filter`, `Save`, `Setting`, `Editor/Viewer` giữ logic cũ.
4. Đảm bảo `Reported mode` vẫn có khả năng `Back to Main` (đặt vào vị trí không phá layout header chính).

### Phase 3 - Visual tuning
1. Chuẩn màu theo style guide Coin98 (vàng, trắng, text xám xanh).
2. Chuẩn button size/radius/padding theo frame P2.
3. Giảm nhiễu thị giác: bỏ icon dư nếu không có trong ref.

### Phase 4 - QA
1. Check desktop width chuẩn (>= 1440) không vỡ header.
2. Check responsive nhỏ hơn: button không chồng/lệch hàng.
3. Check states: filter active count, saving state, auth loading, phase dropdown open.

## Acceptance criteria
1. Header runtime nhìn đúng bố cục như `3Lejg` trong Pencil.
2. Người dùng thấy rõ cụm `mode` bên trái và cụm `action` bên phải.
3. Không mất tính năng cũ: quick mode, phase filter, filter popup, save, setting, editor lock/unlock.
4. Không bị regression khi bật `reported mode`.

## Rủi ro
1. Refactor layout lớn trong `Toolbar.tsx` có thể ảnh hưởng event handling cũ.
2. Dropdown phase/settings có thể lệch vị trí sau khi đổi DOM structure.
3. Responsive nhỏ cần xử lý sớm để tránh overflow.
