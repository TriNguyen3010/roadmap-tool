# Plan: Điều tra nguyên nhân mất dữ liệu Reported (Root Cause Only)

## Mục tiêu
- Chỉ tìm nguyên nhân gốc khiến dữ liệu `Reported` bị mất sau thao tác save.
- Không chỉnh sửa logic, không triển khai fix trong phạm vi plan này.

## Phạm vi
Bao gồm:
1. Thu thập bằng chứng trước/sau save.
2. Tái hiện lỗi với kịch bản có kiểm soát.
3. Khoanh vùng lớp gây mất dữ liệu (UI state, normalize, API save, overwrite).
4. Kết luận nguyên nhân có bằng chứng.

Không bao gồm:
1. Không đổi code nghiệp vụ.
2. Không refactor save flow.
3. Không deploy patch.

## Câu hỏi điều tra chính
1. Dữ liệu `Reported` bị mất ngay trên client trước khi gửi request, hay mất sau khi server ghi?
2. Có xảy ra ghi đè bởi request cũ (race condition) không?
3. Có item bị rớt do normalize priority (`Reported` -> undefined) không?
4. Có save từ tab/session khác đè dữ liệu mới không?

## Kế hoạch điều tra
### Phase 1 - Baseline và snapshot
1. Ghi baseline hiện tại: tổng item, tổng item `Reported`, danh sách ID `Reported`.
2. Trước mỗi lần bấm Save: xuất snapshot A.
3. Sau Save: lấy snapshot B từ nguồn cloud.
4. Diff A/B theo ID để xác định item mất hoặc đổi priority.

### Phase 2 - Reproduce có kiểm soát
1. Dùng một kịch bản thao tác cố định trong Reported mode.
2. Lặp lại 3-5 lần để xem lỗi có lặp lại ổn định không.
3. Ghi timestamp cho từng thao tác và từng lần save.

### Phase 3 - Theo dõi request/response
1. Thu log network cho `POST /api/roadmap/save`:
- thời điểm gửi/nhận
- kích thước payload
- mã phản hồi
2. Đối chiếu payload gửi đi với dữ liệu đã mất để xác định điểm rơi.

### Phase 4 - Khoanh vùng nguyên nhân
1. Nếu payload đã thiếu `Reported` trước khi gửi => nguyên nhân phía client/state.
2. Nếu payload đầy đủ nhưng cloud thiếu => nguyên nhân phía server/write race.
3. Nếu payload hợp lệ nhưng sau reload bị rớt => nghi normalize/load path.
4. Nếu có nhiều request chồng chéo => kết luận overwrite/race.

### Phase 5 - Báo cáo kết luận
1. Root cause chính (1 câu ngắn).
2. Bằng chứng kèm theo (snapshot diff, request timeline).
3. Mức độ tái hiện (100%, ngẫu nhiên, hiếm).
4. Đề xuất hướng fix ở mức ý tưởng (không code).

## Tiêu chí hoàn tất
1. Có thể chỉ ra nguyên nhân gốc bằng dữ liệu cụ thể.
2. Có timeline rõ ràng lỗi xảy ra ở bước nào.
3. Không có thay đổi code trong nhánh điều tra.
