# Plan: Logic hiện tại của `Summary by Object`

## Mục tiêu
- Ghi rõ rule đang chạy của `Summary by Object` để team review và đối chiếu khi thấy lệch dữ liệu.

## 1) Nguồn dữ liệu đầu vào
1. Export `Current View`:
- Sheet `Roadmap` dùng `rows` đang hiển thị (có ảnh hưởng expand/collapse + hidden row).
- Sheet `Summary by Object` dùng `summaryRows` đã filter theo bộ lọc hiện tại, **không phụ thuộc** expand/collapse.
2. Export `Full Data`:
- Mặc định từ UI đang gọi `includeSummary: false`, nên không append sheet summary.

## 2) Cấu trúc block trong `Summary by Object`
Theo đúng thứ tự:
1. `App (Mobile)`
2. `Core`
3. `Web`
4. `Team BA`
5. `Team PD (Product Design)`
6. `Team Dev`
7. `Team QC`
8. `Team Growth`

Mỗi block có format:
1. 1 dòng title block
2. 1 dòng header: `ID | Nội dung`
3. Nếu có dữ liệu: mỗi dòng là `STT | Nội dung`
4. Nếu rỗng: `| Không có dữ liệu`
5. 1 dòng trống ngăn block

## 3) Rule lọc cho từng block
### 3.1 App / Core / Web
1. Chỉ lấy `row.type === 'group'`.
2. Group phải nằm dưới subcategory tương ứng:
- App -> subcategory name `App`
- Core -> subcategory name `Core`
- Web -> subcategory name `Web`
3. Status của group phải thuộc:
- `Dev Handle`
- `Dev In Progress`
- `Not Started`
- `Done`

### 3.2 Team BA
1. Chỉ lấy `row.type === 'item'`.
2. Item có descendant team role `BA`.
3. Status item thuộc:
- `BA Handle`
- `BA In Progress`

### 3.3 Team PD
1. Chỉ lấy `row.type === 'item'`.
2. Item có descendant team role `PD`.
3. Status item thuộc:
- `PD Handle`
- `PD In Progress`

### 3.4 Team Dev
1. Chỉ lấy `row.type === 'item'`.
2. Item có descendant team role `BE` hoặc `FE`.
3. Status item thuộc:
- `Dev Handle`
- `Dev In Progress`
- `Done`

### 3.5 Team QC
1. Chỉ lấy `row.type === 'item'`.
2. Item có descendant team role `QC`.
3. Status item thuộc:
- `QC Handle`
- `QC In Progress`

### 3.6 Team Growth
1. Chỉ lấy `row.type === 'item'`.
2. Item có descendant team role `Growth`.
3. Status item thuộc:
- `Growth Handle`
- `Growth In Progress`

## 4) Cách build cột `Nội dung`
1. Nếu tìm được ancestor `category`: dùng format `Category: FeatureName`.
2. Nếu không có category ancestor: fallback theo group ancestor/name.

## 5) Rule đánh số ID
1. `App (Mobile)` bắt đầu từ 1.
2. `Core` tiếp tục số từ sau `App`.
3. `Web` reset về 1.
4. Mỗi block team reset về 1.

## 6) Tác động của filter (quan trọng)
`summaryRows` đi qua toàn bộ filter hiện tại:
1. Category
2. Status
3. Team
4. Priority
5. Phase
6. Subcategory
7. WorkType (groupItemType)

=> Nếu lọc `Phase 2` mà block rỗng, cần kiểm tra thêm:
1. Có group/item match phase không.
2. Status có nằm trong tập status của block không.
3. Có đúng subcategory/team role theo rule block không.

## 7) Gợi ý phase tiếp theo (nếu cần đổi rule)
1. Thống nhất lại rule `App/Core/Web` theo phase-first (không phụ thuộc status group) nếu nghiệp vụ yêu cầu.
2. Cân nhắc thêm cột debug trong summary (phase/status/teamRole) để audit nhanh.
