# Plan: Phân tích và vẽ lại UI Roadmap theo mục tiêu rõ ràng

## Mục tiêu
- Tăng độ rõ ràng khi đọc roadmap ở cả bảng trái và timeline phải.
- Giảm nhiễu thị giác do quá nhiều màu, quá nhiều lớp thông tin cùng lúc.
- Ưu tiên nhìn nhanh 3 thứ: đang làm gì, trạng thái gì, nằm ở tuần nào.

## Audit nhanh từ màn hiện tại
1. Thanh top đang quá nhiều nút cùng mức ưu tiên, khó biết hành động chính.
2. Header cột và metadata timeline hơi nhỏ, độ tương phản thấp.
3. Nền row đang dùng nhiều lớp màu (xanh dương/xanh lá/xám) làm mất điểm nhấn dữ liệu chính.
4. Timeline header quá dày thông tin (week/day/weekend/today) nên bị rối.
5. Status/Phase/Tag có style chưa thống nhất, khó scan theo chiều dọc.
6. Cột Name bị chật khi tên item dài, người dùng phải đoán phần bị cắt.
7. Vạch phân chia bảng/timeline và highlight today đang cạnh tranh nhau.
8. Visual hierarchy của Group, Subgroup, Item chưa tách lớp đủ rõ.

## Phần bắt buộc vẽ lại (UI Redraw Scope)
1. Global Top Bar
- Gom cụm chức năng theo mức ưu tiên.
- Chỉ giữ 1 CTA chính nổi bật (ví dụ Save hoặc Filter tuỳ mode).
- Tăng khoảng trắng để phân tách “view mode” và “actions”.

2. Table Header + Column System
- Thiết kế lại header row rõ thứ tự đọc: ID -> Name -> Status -> Phase -> WorkType -> Priority -> Team.
- Chuẩn width theo nội dung thực tế, đặc biệt Name và Status.
- Tăng contrast cho header text.

3. Group/Subgroup/Item Rows
- Phân tầng trực quan rõ ràng bằng indentation + weight + background rất nhẹ.
- Giảm số màu nền row, ưu tiên 1 base + 1 hover + 1 selected.
- Marker/Phase tag đặt ổn định để scan nhanh theo chiều dọc.

4. Status / Phase / WorkType / Priority Cell UI
- Đồng bộ style chip/dropdown trigger.
- Màu theo semantic nhưng giảm saturation.
- Giữ kích thước chip ổn định để tránh lệch hàng.

5. Timeline Header
- Giảm mật độ thông tin theo 2 lớp: tuần (primary) + ngày (secondary).
- Weekend chỉ nhấn nhẹ, không cạnh tranh với today.
- Cột today dùng một pattern nhất quán, không dùng quá nhiều màu chồng.

6. Timeline Body + Bars
- Task bar tăng tương phản với background.
- Bo góc và độ cao bar đồng nhất.
- Nhãn bar (nếu có) ưu tiên ngắn và không che nội dung khác.

7. Divider, Gridline, Highlight Rules
- Chuẩn hóa độ đậm nhạt của line dọc/ngang.
- Chỉ 1 đường phân tách mạnh giữa bảng trái và timeline phải.
- Đảm bảo line không lấn át dữ liệu.

8. States và khả dụng
- Vẽ lại trạng thái rỗng, loading, no data cho table/timeline.
- Bổ sung trạng thái hover/focus/active cho cell có dropdown.

## Nguyên tắc visual để “nhìn rõ ràng”
1. Một màn chỉ có 1 điểm nhấn màu chính tại cùng thời điểm.
2. Tối đa 3 cấp chữ: Header, Body, Meta.
3. Tối đa 2 lớp nền row (base + grouped tint nhẹ).
4. Dữ liệu quan trọng hơn decoration: giảm border trang trí dư.
5. Tăng khả năng scan dọc theo cột Status và Phase.

## Kế hoạch theo đợt (Pencil)
### Đợt 1 - Khung đọc và điều hướng
1. Redraw Top Bar.
2. Redraw Table Header + hệ cột.
3. Redraw phân tầng Group/Subgroup/Item.

### Đợt 2 - Nội dung dữ liệu chính
1. Redraw Status/Phase/WorkType/Priority chip & dropdown state.
2. Redraw timeline header/day/week/today.
3. Redraw task bars và gridline.

### Đợt 3 - Trạng thái và polish
1. Redraw empty/loading/no-data states.
2. Chuẩn hóa hover/focus/selected.
3. QA độ rõ ở 100% zoom và khi nhiều dữ liệu.

## Tiêu chí hoàn tất
1. Người dùng nhìn 3 giây nhận ra ngay: group nào, status nào, phase nào.
2. Tên item dài vẫn đọc được ý chính (giảm truncate gây mất nghĩa).
3. Timeline không còn cảm giác rối khi bật today + weekend.
4. Cụm điều khiển top bar rõ primary/secondary action.
5. Không còn lỗi lệch hàng chip/dropdown giữa các row.

## Deliverables
1. 01 frame mới `Roadmap Main - Clarity Redraw` trong file Pencil.
2. 01 frame so sánh Before/After (đặt cạnh nhau).
3. 01 checklist QA visual bám theo tiêu chí trên.
