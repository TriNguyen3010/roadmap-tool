# Plan: Make Reported Mode On `a8335e0e-55ec-42c9-920f-d64c32825cc8` Show Data From `main`

## Goal

Đi đường tắt:

- khi mở roadmap `a8335e0e-55ec-42c9-920f-d64c32825cc8`
- nếu bấm `Reported`
- UI reported sẽ hiển thị dữ liệu reported lấy từ roadmap `main`

Mục tiêu là:

- không cần migrate reported data ngay lập tức
- vẫn dùng được reported review UI trên roadmap `a833...`
- giảm rủi ro phải copy/import lại dữ liệu trong giai đoạn ngắn hạn
- khi vào reported bridge, user thấy đủ `99` item ngay

## Current Code Reality

Sau khi rà code:

- `page.tsx` đang load đúng `roadmapId` hiện tại qua `/api/roadmap/${roadmapId}`
- `SpreadsheetGrid` nhận đúng `data` của roadmap hiện tại
- `reportedMode` chỉ là một UI mode trong `SpreadsheetGrid`, không có data source riêng

Nói cách khác:

- hiện tại `Reported` luôn đọc từ roadmap đang mở
- chưa có khái niệm `reported source roadmap`

Ngoài ra, `reportedMode` hiện vẫn còn bị ảnh hưởng bởi một phần filter state hiện có:

- `category`
- `status`
- `team`
- `phase`
- `subcategory`
- `groupItemType`
- `hidden rows`

Trong `SpreadsheetGrid`, `reportedEntries` đúng là luôn lọc `priority = Reported`, nhưng trước đó scope vẫn đang bị bóp bởi các filter kể trên.

Điều này có nghĩa là:

- nếu user đang có filter/team/week/category cũ
- hoặc đã hide một số row
- thì vào `Reported` chưa chắc đã nhìn đủ `99` item

## Important Risk

Reported UI hiện không chỉ để xem.

Nó vẫn có các luồng edit/save liên quan đến item hiện tại, ví dụ:

- quick note
- status
- một số hành vi preview/edit tùy permission

Vì vậy nếu chỉ “đổ data của `main` vào UI reported” mà không chặn write path, rất dễ xảy ra:

- đang mở roadmap `a833...`
- nhưng thao tác reported lại save nhầm theo context của roadmap hiện tại
- hoặc tạo trạng thái đọc từ `main` nhưng save vào `a833...`

## Recommendation

Phase đầu tiên nên làm theo hướng:

- `reported bridge = read-only`

Tức là:

- khi ở roadmap `a833...` và bật `Reported`
- UI chỉ hiển thị data của `main`
- mọi hành vi edit trong reported view bị disable

Đây là đường tắt an toàn nhất.

Nếu sau này muốn cho edit thật, đó phải là Phase 2 riêng.

## Phase 1: Add Special-Case Reported Source Mapping

Thêm một mapping rõ ràng ở app layer:

- nếu `roadmapId === 'a8335e0e-55ec-42c9-920f-d64c32825cc8'`
- thì `reportedSourceRoadmapId = 'main'`
- còn roadmap khác thì `reportedSourceRoadmapId = roadmapId`

Khuyến nghị:

- không hardcode rải rác
- tạo helper riêng kiểu:
  - `resolveReportedSourceRoadmapId(roadmapId: string): string`

Deliverable:

- một source-of-truth rõ ràng cho reported-source mapping

## Phase 2: Load Alternate Data Only For Reported Mode

Trong `page.tsx`:

- giữ `data` hiện tại như cũ cho grid/table/timeline bình thường
- thêm state mới kiểu:
  - `reportedSourceData`
  - `reportedSourceLoading`
  - `reportedSourceError`

Rule:

- chỉ fetch source roadmap khi:
  - `isReportedMode === true`
  - và `reportedSourceRoadmapId !== roadmapId`

Source fetch:

- gọi `/api/roadmap/main`
- hydrate riêng cho reported view
- không đè `data` chính của roadmap `a833...`

Deliverable:

- `reported view` có thể dùng data source riêng

## Phase 2.5: Add A Dedicated `Reported` Sample Filter For The Bridge

Mục tiêu của phase này:

- khi user bật `Reported` trên roadmap `a833...`
- UI có một filter mẫu rõ ràng là `Reported`
- và reported bridge phải hiện đủ `99` item ngay

### Important clarification

`Reported` sample filter ở đây không nên chỉ là một chip trang trí.

Nó phải đi kèm rule scope rõ ràng:

- reported bridge chỉ giữ lại rule `priority = Reported`
- không bị ảnh hưởng bởi các filter cũ của roadmap `a833...`

### Recommended behavior

Khi vào reported bridge:

- hiện một badge/filter mẫu:
  - `Reported`
- reset `reportedCategoryFilter` về `All`
- bỏ ảnh hưởng của các filter sau trong reported bridge:
  - `category`
  - `status`
  - `team`
  - `phase`
  - `subcategory`
  - `groupItemType`
  - `hiddenRowIds`

Như vậy user sẽ thấy đúng full scope reported data từ `main`.

### Important UX boundary

Không nên mutate vĩnh viễn filter state chính của page.

Khuyến nghị:

- dùng `reported bridge scoped filters`
- hoặc bypass filter state khi `isReportedBridgeReadOnly === true`

Tức là:

- thoát `Reported` xong
- user vẫn quay lại đúng filter state cũ của roadmap `a833...`

### Deliverable

- reported bridge có một chip/badge `Reported`
- count/card list mặc định ra đủ `99` item
- không làm mất filter state chính của user khi thoát mode

## Phase 3: Pass Effective Reported Data Into SpreadsheetGrid

Thêm một khái niệm effective data ở page:

- `gridData = data`
- `reportedData = reportedSourceData ?? data`

Sau đó truyền vào `SpreadsheetGrid` theo một trong hai cách:

### Option A

Truyền thêm prop riêng:

- `reportedData?: RoadmapDocument`

và trong `SpreadsheetGrid`, nếu `reportedMode === true` thì dùng `reportedData`

### Option B

Page tự chọn:

- nếu `reportedMode` thì truyền `reportedSourceData`
- còn mode khác thì truyền `data`

Khuyến nghị:

- Option A rõ nghĩa hơn, ít làm mờ semantics của prop `data`

## Phase 4: Force Read-Only For Bridged Reported Mode

Đây là phần quan trọng nhất của shortcut này.

Khi:

- `roadmapId === a833...`
- `reportedMode === true`
- `reportedSourceRoadmapId === main`

thì reported UI phải bị hạ xuống read-only:

- không edit quick note
- không edit status
- không upload/xóa ảnh
- không trigger manager/admin save

Implementation direction:

- tính thêm flag:
  - `isReportedBridgeReadOnly`

và dùng flag này để:

- override permission trong reported mode
- hiện banner nhỏ kiểu:
  - `Đang xem Reported data từ roadmap main (read-only)`

## Phase 5: Loading/Error UX

Vì reported data giờ có fetch riêng:

- cần loading state khi bật Reported lần đầu
- cần error state nếu không load được `main`

UX tối thiểu:

- loading skeleton hoặc text `Đang tải reported data...`
- error state `Không thể tải dữ liệu reported từ roadmap main`

Fallback:

- nếu fetch lỗi, không được dùng nhầm `data` của `a833...` như thể đó là `main`
- nên fail rõ ràng

## Phase 6: Verification

Các case cần test:

1. Mở roadmap `a833...`
   - mode thường vẫn dùng data của `a833...`

2. Bấm `Reported`
   - thấy data reported từ `main`
   - thấy chip/filter mẫu `Reported`
   - count/category/cards khớp `main`
   - mặc định thấy đủ `99` item

3. Thoát `Reported`
   - quay lại data thường của `a833...`
   - filter state cũ của roadmap `a833...` vẫn còn nguyên

4. Refresh khi đang ở `Reported`
   - vẫn load đúng bridge source
   - vẫn giữ default sample filter `Reported`

5. Thử edit trong reported bridge
   - bị disable đúng
   - không có request save nhầm

6. Mở roadmap khác rồi bấm `Reported`
   - vẫn dùng source roadmap của chính nó

## Phase 7: Optional Future Upgrade

Nếu sau này muốn không chỉ xem mà còn sửa trực tiếp `main` từ roadmap `a833...`, đó phải là phase riêng:

- bridge write path
- reported save route phải target `main`
- optimistic update/version check phải theo version của `main`
- realtime invalidation cũng phải subscribe `main`

Đây là scope lớn hơn nhiều và không nên gộp vào shortcut hiện tại.

## Why This Shortcut Is Acceptable

Với nhu cầu ngắn hạn:

- cần reported UI trên roadmap `a833...`
- chưa muốn migrate/copy data

thì read-only bridge là cách nhanh và an toàn hơn:

- không đụng DB schema
- không đụng import/migration
- không tạo duplicate reported data

## Acceptance Criteria

- chỉ roadmap `a8335e0e-55ec-42c9-920f-d64c32825cc8` có special-case này
- bật `Reported` trên roadmap đó sẽ đọc dữ liệu từ `main`
- khi vào reported bridge sẽ hiện filter mẫu `Reported`
- reported bridge không bị bóp bởi filter cũ của roadmap `a833...`
- user thấy đủ `99` item mặc định
- các mode khác vẫn dùng data thật của `a833...`
- reported bridge là read-only
- không có save nhầm vào roadmap `a833...`
- roadmap khác không bị ảnh hưởng
