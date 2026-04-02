# Concurrent Editing Risk Report

## Mục tiêu

Đánh giá xem roadmap hiện tại có an toàn không khi **nhiều người cùng sửa cùng một thời điểm**, và chỉ ra các rủi ro kỹ thuật chính.

## Phạm vi kiểm tra

Đây là **code review report**, chưa phải bài test chạy nhiều browser thật.

Đã đọc các luồng chính:

- `src/app/roadmap/[id]/page.tsx`
- `src/components/SpreadsheetGrid.tsx`
- `src/app/api/roadmap/[id]/save/route.ts`
- `src/app/api/roadmap/[id]/manager-save/route.ts`
- `src/app/api/roadmap/[id]/version/route.ts`
- `src/utils/permissionCheck.ts`
- `src/utils/permissions.ts`

## Kết luận ngắn gọn

Hiện tại app **có thể cho nhiều người cùng sửa**, nhưng **chưa có cơ chế chống conflict đủ mạnh**.

Mô hình hiện tại là:

- dữ liệu roadmap được lưu thành **một JSON document lớn** trong `roadmap_data.content`
- admin dùng **full-save**
- manager dùng **field-patch kiểu read -> modify -> write**
- client chỉ có **poll version mỗi 20 giây + banner refresh**

Nói ngắn gọn: hệ thống hiện đang ở trạng thái **last-write-wins**, chưa phải collaborative editing thật sự.

## Những điểm đang hoạt động ổn

### 1. Manager save an toàn hơn full-save

Manager không gửi cả roadmap lên server, mà chỉ gửi:

- `status`
- `startDate`
- `endDate`
- `quickNote`

Sau đó server:

1. đọc roadmap mới nhất từ DB
2. validate item có đúng team không
3. apply đúng field được phép
4. recalculate lại tree
5. lưu lại

Điều này giúp giảm rủi ro hơn so với việc manager full-save cả document.

### 2. Permission chặn được sửa ngoài scope

Manager chỉ được sửa item thuộc team của mình, và chỉ được sửa một số field nhất định. Phần này về logic permission nhìn chung là hợp lý.

### 3. Có version polling cơ bản

Client có poll `updated_at` định kỳ và hiện banner khi thấy roadmap trên server đã mới hơn bản local.

Phần này có ích, nhưng mới chỉ là cảnh báo mềm.

## Findings

### High - Admin full-save có thể đè mất thay đổi của người khác

Admin save hiện tại gửi **toàn bộ document** lên `/api/roadmap/[id]/save`, rồi server `upsert` đè nguyên row.

Không có:

- `baseVersion`
- `If-Match`
- `etag`
- `409 conflict`
- merge theo diff

Hệ quả:

- Admin A mở roadmap lúc 10:00
- Manager B sửa vài item lúc 10:02 và lưu thành công
- Admin A bấm save lúc 10:03 từ snapshot cũ
- thay đổi của B có thể bị mất hoàn toàn

Đây là rủi ro lớn nhất hiện tại.

### High - Manager-save vẫn có race condition kiểu read-modify-write

`/manager-save` an toàn hơn full-save, nhưng vẫn là flow:

1. đọc row hiện tại
2. apply patch trong memory
3. `upsert` lại toàn bộ `content`

Nếu 2 request manager đến gần như cùng lúc:

- cả hai cùng đọc một snapshot cũ
- mỗi request tạo ra một `savedDoc` riêng
- request ghi sau sẽ đè request ghi trước

Điều này có nghĩa là:

- 2 manager sửa cùng item: rất dễ mất dữ liệu
- 2 manager sửa item khác nhau nhưng request overlap thật sự: vẫn có thể mất dữ liệu

Nói cách khác, manager-save hiện tại **giảm blast radius**, nhưng **không loại bỏ conflict**.

### High - View settings đang là dữ liệu dùng chung, nên người này rất dễ đè layout/filter của người kia

Admin save không chỉ lưu task data, mà còn lưu cả `settings`, ví dụ:

- filter
- beforeWeeks / afterMonths
- timeline mode
- timeline only
- expanded ids
- hidden row ids
- width các cột

Những thứ này hiện đang được lưu chung trong roadmap document.

Điều đó tạo ra một vấn đề collaborative rất rõ:

- đây đáng ra phần lớn là **user preference**
- nhưng hiện đang trở thành **shared state của cả roadmap**

Ví dụ:

- Admin A đổi filter và bấm save view
- Admin B đang xem view khác, sau đó save cấu trúc
- settings của A hoặc B sẽ đè lẫn nhau

Ngay cả khi task data không conflict, **UI state vẫn conflict mạnh**.

### Medium - Banner version chỉ là cảnh báo mềm, không chặn save stale data

Client chỉ poll `/version` mỗi `20s`.

Vấn đề:

- 20 giây là đủ lâu để conflict xảy ra
- user vẫn có thể tiếp tục save từ local stale state
- user có thể bấm `Để sau`
- save API không hề kiểm tra client đang save từ version nào

Tức là:

- có cảnh báo
- nhưng không có enforcement

### Medium - Refresh để lấy bản mới sẽ làm mất local edit chưa lưu

Khi có bản mới trên server, UI hiện nút `Refresh`, nhưng action hiện tại là `window.location.reload()`.

Điều này có nghĩa:

- local changes chưa save sẽ mất
- không có diff preview
- không có merge preview
- không có "keep mine / take remote"

Đây không phải data corruption server-side, nhưng là UX rất dễ làm mất công sửa của người dùng.

### Medium - Không có realtime sync hoặc cross-tab sync

Hiện không thấy:

- Supabase Realtime subscription
- websocket collaboration
- BroadcastChannel
- storage event sync giữa nhiều tab

Hệ quả:

- 2 người mở cùng roadmap không thấy update gần như real-time
- cùng một user mở 2 tab cũng có thể tự đè dữ liệu của chính mình

### Medium - Chưa có test bao phủ conflict/concurrent save

Codebase hiện có test cho:

- permissions
- helper
- formatting

Nhưng chưa thấy test cho:

- stale version save
- concurrent manager-save
- admin save overwrite
- conflict response handling

Điều này làm rủi ro multi-user khó được phát hiện sớm.

## Đánh giá theo từng tình huống

### Tình huống 1 - 2 manager khác team sửa khác item, không cùng lúc sát nhau

Khả năng ổn: **khá ổn**

Vì manager-save sẽ lấy bản mới từ DB rồi apply patch hẹp.

### Tình huống 2 - 2 manager sửa gần như đồng thời

Rủi ro: **trung bình đến cao**

Nếu request overlap đúng lúc, vẫn có thể bị last-write-wins.

### Tình huống 3 - 1 admin và 1 manager cùng sửa

Rủi ro: **cao**

Vì admin full-save có thể ghi đè toàn bộ document từ snapshot cũ.

### Tình huống 4 - 2 admin cùng sửa

Rủi ro: **rất cao**

Đây là case nguy hiểm nhất, vì cả hai đều full-save cả document và cả shared settings.

## Mức độ khả thi hiện tại

### Có thể dùng được khi nào

Có thể dùng tạm nếu team làm việc theo kỷ luật:

- một thời điểm chỉ 1 admin sửa cấu trúc
- manager chỉ sửa field thuộc team mình
- tránh cùng sửa một roadmap cùng lúc trong thời gian dài
- khi có banner version thì refresh trước khi sửa tiếp

### Chưa phù hợp khi nào

Chưa phù hợp cho kỳ vọng:

- nhiều người cùng edit realtime
- nhiều admin cùng tinh chỉnh layout / structure
- cần đảm bảo không mất dữ liệu khi save đồng thời

## Khuyến nghị ưu tiên

### Ưu tiên 1 - Thêm optimistic concurrency check cho cả `/save` và `/manager-save`

Nên gửi kèm `baseVersion` từ client.

Server cần:

1. đọc `updated_at` hiện tại
2. so với `baseVersion` client gửi lên
3. nếu lệch -> trả `409 Conflict`

Khi đó client có thể:

- chặn save stale data
- báo rõ roadmap đã bị người khác sửa
- yêu cầu reload trước khi lưu lại

### Ưu tiên 2 - Không lưu user view settings chung trong roadmap document

Nên tách các field sau ra khỏi shared document:

- filter
- expanded ids
- hidden row ids
- column widths
- timeline mode
- timeline only

Có thể lưu:

- localStorage theo user/browser
- hoặc bảng riêng kiểu `roadmap_user_settings`

Đây là fix rất đáng làm vì giảm conflict mạnh mà không cần đụng vào business data trước.

### Ưu tiên 3 - Với manager-save, dùng version check hoặc DB RPC transaction

Manager-save hiện đã hẹp scope, nhưng vẫn nên thêm:

- `baseVersion`
- update có điều kiện theo `updated_at`

Hướng tốt hơn:

- update trong DB function / RPC
- chỉ commit nếu version còn khớp

### Ưu tiên 4 - Chặn save khi đang có remote update chưa xử lý

Nếu `pendingRemoteVersion` đang tồn tại, nên:

- disable save
- hoặc bắt user chọn `Refresh` trước
- hoặc mở dialog `remote changed / local changed`

Không nên chỉ hiện banner rồi vẫn cho full-save bình thường.

### Ưu tiên 5 - Bổ sung test conflict

Nên có test cho ít nhất các case:

1. admin save với `baseVersion` cũ -> `409`
2. manager save với `baseVersion` cũ -> `409`
3. 2 patch song song -> request sau bị reject nếu stale
4. user UI xử lý đúng khi gặp conflict

## Đề xuất kết luận vận hành

### Nếu chưa fix ngay

Rule vận hành tạm thời nên là:

- chỉ 1 admin chỉnh structure / milestones / settings tại một thời điểm
- manager tránh sửa cùng item cùng lúc
- nếu thấy banner có dữ liệu mới thì refresh trước khi save tiếp

### Nếu muốn hỗ trợ multi-user nghiêm túc

Mốc tối thiểu nên đạt:

1. `baseVersion` + `409 conflict`
2. tách shared settings ra khỏi document
3. manager-save có conditional write

Sau đó mới nên nghĩ tiếp tới:

- realtime sync
- presence
- merge UI

## Kết luận cuối

Hiện trạng: **dùng được cho team nhỏ với quy ước thao tác**, nhưng **chưa an toàn cho concurrent editing đúng nghĩa**.

Rủi ro lớn nhất không nằm ở permission, mà nằm ở:

- full document overwrite
- lack of version enforcement
- shared UI settings bị lưu chung vào roadmap

Nếu phải xếp mức độ:

- **Permission model**: khá ổn
- **Collaborative safety**: còn yếu
- **Khả năng mất dữ liệu khi nhiều người cùng sửa**: có thật, đặc biệt ở flow admin full-save
