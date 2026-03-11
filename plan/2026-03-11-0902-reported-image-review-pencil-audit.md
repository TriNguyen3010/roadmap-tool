# Plan: Audit lại Pencil `Reported Image Review` và chỉnh plan

## Mục tiêu
- Check đúng file Pencil hiện tại và cập nhật plan theo hiện trạng thật.
- Tránh lệch giữa plan và màn đã vẽ trong `design/pencil-new.pen`.

## File và màn đã kiểm tra
1. File: `design/pencil-new.pen`
2. `bi8Au` - `Reported Image Review - Main`
3. `EQZTl` - `Reported Image Review - Viewer`
4. `G4EAC` - `Reported Image Review - States`

## Kết quả audit (hiện trạng thật)
1. File đúng nằm ở `design/pencil-new.pen` (không phải root `pencil-new.pen`).
2. Hiện có **3 màn chính** (Main / Viewer / States), chưa thấy frame riêng cho `Edit Entry`.
3. Main đã có header compact + body riêng, không bị overlap layout.
4. Viewer đã có 2 vùng trigger `Status` và `Phase` dạng control (`▾`) để bấm.
5. Có lỗi layout cần fix:
- `Svby9` (`viewerTitle`) bị `partially clipped` trong `VeCys`.
- `LQZ1W` (`emptyCategoryBody`) bị `partially clipped` trong `enGCk`.

## Điểm lệch làm plan cũ sai
1. Một số plan cũ giả định đủ 4 màn (kể cả `Edit Entry`) nhưng file hiện tại chỉ có 3 màn.
2. Plan cũ nói chung về runtime nhiều, nhưng chưa khóa danh sách lỗi visual cụ thể trong `.pen`.
3. Chưa có bước bắt buộc “audit layout problems” trước khi qua phase high-fidelity.

## Plan cập nhật theo phase (đúng theo file Pencil)

## Phase A - Stabilize bản vẽ hiện tại
1. Fix toàn bộ phần tử bị clip trong 3 màn.
2. Chuẩn lại text wrapping cho các block body dài (states/viewer).
3. Re-check bằng `snapshot_layout(...problemsOnly=true)` phải trả về `No layout problems`.

### Acceptance
1. Không còn `partially clipped` trong `Main/Viewer/States`.
2. Text không cắt đầu/cuối trong các card và panel phải.

## Phase B - Hoàn thiện interaction spec trong Pencil
1. Làm rõ trạng thái trigger `Status`/`Phase`: default, hover, open list, selected.
2. Thêm state khi click `Open Full Edit` (điểm đến và cách quay lại viewer).
3. Chuẩn hóa label/back action: `Back to Main Project` cho dễ hiểu.

### Acceptance
1. Có đủ state frame hoặc annotation cho dropdown interaction.
2. Flow Viewer -> Edit -> Back thể hiện rõ trong file design.

## Phase C - Bổ sung màn còn thiếu (nếu scope cần)
1. Nếu vẫn giữ scope high-fidelity đầy đủ, thêm frame `Reported Image Review - Edit Entry`.
2. Đồng bộ typography/màu với style vàng-trắng đã chốt.

### Acceptance
1. Bộ màn final gồm Main + Viewer + States + Edit Entry (nếu cần).
2. Naming và component logic nhất quán toàn bộ feature.

## Rủi ro
1. Tiếp tục cập nhật UI runtime trước khi chốt design sẽ gây lệch lại.
2. Không khóa state dropdown trong design sẽ khó QA interaction.

## Thứ tự triển khai đề xuất
1. Làm ngay Phase A (fix clip/wrap).
2. Sau đó Phase B (interaction spec).
3. Cuối cùng Phase C (bổ sung màn thiếu theo scope).
