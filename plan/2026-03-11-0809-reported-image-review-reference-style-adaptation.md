# Plan: Áp dụng style từ hình ref cho `Reported Image Review`

## Mục tiêu
- Đồng bộ giao diện `Reported Image Review` theo style của ref: sạch, sáng, bố cục rõ, cảm giác product-ready.
- Giữ trọng tâm vào ảnh và thao tác review nhanh, nhưng visual tone giống Coin98 Campaign Station.

## Tín hiệu style rút ra từ ref
1. Nền sáng trung tính, card trắng bo góc nhẹ, border mảnh.
2. Typography đậm ở heading, text mô tả màu xám xanh dịu.
3. Header mỏng, tối giản, logo/brand rõ ràng.
4. Tabs kiểu underline (active dùng vàng).
5. Card grid đều nhau, metadata rõ, CTA dạng pill/button tinh gọn.
6. Accent màu vàng dùng tiết chế để nhấn trạng thái/action.

## Phạm vi áp dụng
1. `Reported Image Review - Main`
2. `Reported Image Review - Viewer`
3. `Reported Image Review - States`
4. `Style Guide - Reported Review` (cập nhật token theo ref)

## Quy đổi style sang tính năng hiện tại
1. **Main**
- Header thấp hơn, sạch hơn: title + subtitle ngắn + search + action.
- Thêm tab hàng ngang: `Reported`, `Needs Image`, `Done Review` (kiểu underline vàng).
- Card item chuẩn hóa chiều cao và khoảng cách giống ref grid.
- Metadata trong card ưu tiên 2 dòng: status/phase + date/note ngắn.

2. **Viewer**
- Background overlay sáng hơn (không quá dark).
- Khối ảnh chính lớn, panel phải tối giản.
- `Status` và `Phase` dạng control sạch, màu tint nhẹ.
- CTA chính dùng accent vàng hoặc xanh theo hierarchy.

3. **States**
- Empty/No-data/No-image dùng card trắng + icon/placeholder nhẹ.
- Ngôn ngữ ngắn, dễ hiểu; CTA rõ ràng 1 hành động chính.

## Design tokens cập nhật (theo ref)
1. **Màu chủ đạo bắt buộc: vàng + trắng**
- Primary Yellow: `#F0B90B`
- Yellow hover/darker: `#DFA300`
- Page background white: `#FFFFFF`
- Section background trắng ngà nhẹ: `#FAFBFC`
2. Card surface: `#FFFFFF`, border `#E6EBF2`, radius `14-16`.
3. Text primary: gần `#0B132B`; text secondary: xám xanh trung tính `#64748B`.
4. Accent vàng dùng cho: active tab underline, CTA chính, highlight trạng thái ưu tiên.
5. Badge/status dùng nền tint nhẹ, không bão hòa cao.

## Typography spec (font text + font size)
1. **Font family**
- Heading: `Plus Jakarta Sans` (semibold/bold)
- Body/UI text: `Plus Jakarta Sans` (regular/medium)
2. **Font size chuẩn**
- Hero/Screen title: `44px` (desktop)
- Section title: `32px`
- Card title: `24px`
- Body text chính: `16px`
- Meta text / secondary info: `14px`
- Label / caption / chip text: `12px`
3. **Font weight chuẩn**
- Title: `700`
- Section/Card title: `600`
- Body: `400`
- Metadata/label: `500`
4. **Line-height gợi ý**
- Title lớn: `120%`
- Body + metadata: `140% - 150%`

## Kế hoạch triển khai bằng Pencil
1. Cập nhật `Style Guide - Reported Review` theo palette + typography mới.
2. Refactor `Main`: header, tab row, grid card, metadata hierarchy.
3. Refactor `Viewer`: panel phải gọn, control status/phase rõ hơn.
4. Refactor `States`: card state đồng bộ style ref.
5. Chụp screenshot 4 frame để review chênh lệch trước/sau.

## Tiêu chí hoàn tất
1. Nhìn tổng thể gần tone của ref (clean/light/card-based/yellow-accent).
2. Main vẫn ưu tiên xem ảnh và review theo category.
3. Viewer vẫn chỉnh được `Status` + `Phase` trực tiếp (ít nhiễu thị giác).
4. States rõ nghĩa, không còn khoảng trống vô ích.

## Deliverables
1. Cập nhật 4 frame trong `pencil-new.pen`.
2. 01 bộ screenshot sau khi restyle.
3. Ghi chú mapping style ref -> thành phần UI hiện tại.
