# Table Data Vs JSON Document For Concurrent Editing

## Câu trả lời ngắn

**Có, an toàn hơn đáng kể** nếu task được lưu thành **row-based table data** thay vì cả roadmap là một JSON blob.

Nhưng cần nói rất rõ:

**Table data không tự động giải quyết conflict**.

Nó chỉ thực sự an toàn hơn khi đi kèm:

- update theo từng row / từng field
- optimistic concurrency (`version`, `updated_at`, `row_version`)
- transaction cho các thao tác nhiều row
- tách `user settings` ra khỏi shared business data

Nếu chỉ đổi nơi lưu từ JSON sang table nhưng vẫn:

- load toàn bộ tree
- sửa local
- save đè lại toàn bộ snapshot

thì mức an toàn sẽ **không cải thiện nhiều**.

## So với mô hình hiện tại

### Hiện tại

Roadmap đang được lưu như:

- 1 row trong `roadmap_data`
- cột `content` chứa cả document JSON lớn
- bên trong có:
  - items tree
  - milestones
  - settings

Khi save:

- admin thường ghi lại cả document
- manager tuy chỉ gửi field change, nhưng server vẫn đọc toàn bộ JSON rồi ghi lại cả `content`

Điểm yếu chính:

- `last-write-wins`
- conflict dễ xảy ra khi nhiều người cùng sửa
- UI settings bị đè lẫn nhau

### Nếu chuyển sang table data

Ví dụ mỗi task là 1 row riêng:

- `roadmap_items`
- mỗi item có `id`, `roadmap_id`, `parent_id`, `sort_order`, `status`, `start_date`, `end_date`, `quick_note`, ...

thì khi người dùng sửa:

- đổi `status` của 1 item -> update đúng 1 row
- đổi `quick_note` của 1 item -> update đúng 1 row
- đổi date của 1 item -> update đúng 1 row

Điều này giúp giảm rất mạnh khả năng:

- người A sửa item 1
- người B sửa item 2
- rồi hai bên vô tình đè mất dữ liệu của nhau

## Vì sao table data an toàn hơn

### 1. Giảm phạm vi ghi đè

JSON blob:

- sửa 1 field nhỏ nhưng thường phải ghi lại cả document lớn

Table rows:

- sửa item nào thì update item đó

Đây là lợi ích lớn nhất.

### 2. Conflict được cô lập theo row

Nếu 2 người sửa 2 item khác nhau:

- JSON model: vẫn có thể conflict vì cùng đụng 1 blob
- table model: thường không conflict nếu là 2 row khác nhau

### 3. Dễ làm optimistic concurrency đúng nghĩa hơn

Mỗi row có thể có:

- `updated_at`
- `version`
- `revision`

Server có thể update kiểu:

```sql
update roadmap_items
set status = 'FE Start', updated_at = now()
where id = :id and updated_at = :base_updated_at;
```

Nếu `0 row affected`:

- nghĩa là item đã bị người khác sửa trước
- server trả `409 Conflict`

Mô hình này rõ ràng và rất tự nhiên với table data.

### 4. Dễ audit và debug hơn

Có thể log:

- ai sửa item nào
- field nào bị đổi
- lúc nào đổi

Điều này khó làm sạch sẽ nếu tất cả nằm trong 1 JSON blob.

### 5. Permission chi tiết hơn

Nếu sau này muốn:

- manager FE chỉ update item team FE
- admin chỉ update milestone
- viewer chỉ read

thì table model dễ enforce hơn ở SQL / API / RLS.

## Nhưng table data không phải thuốc tiên

### 1. Nếu vẫn save kiểu snapshot thì vẫn conflict

Ví dụ:

- server đọc toàn bộ `roadmap_items`
- build lại tree
- client sửa local
- gửi full tree xuống
- server replace toàn bộ row set

thì conflict vẫn gần giống mô hình JSON.

Nên lợi ích chỉ có nếu write model cũng chuyển sang:

- row-level update
- patch-level update
- conditional update

### 2. Tree hierarchy làm complexity tăng

Roadmap này không phải flat list.

Nó có:

- category
- subcategory
- group
- team
- item
- reorder theo sibling

Nên nếu chuyển sang table, phải thiết kế:

- `parent_id`
- `sort_order`
- `depth` hoặc query tree
- cách move subtree

Phần này làm system khó hơn, dù concurrent safety tốt hơn.

### 3. Derived data phải được tính lại cẩn thận

Hiện app có logic:

- recalculate status cha
- recalculate progress
- normalize timestamps

Nếu dùng table, cần quyết định:

- derive ở app
- derive ở API
- derive ở DB function

Nếu không thống nhất, dữ liệu dễ lệch.

### 4. Bulk operations cần transaction

Một số thao tác không còn là 1 row:

- reorder nhiều item
- move subtree
- apply date theo phase
- delete node cùng toàn bộ children

Những thao tác này vẫn cần:

- transaction
- locking / ordering strategy
- version check nhiều row

Nghĩa là table model tốt hơn, nhưng implementation khó hơn.

## Với codebase hiện tại, điều gì nên tách ra đầu tiên

Ngay cả trước khi full migrate sang table, có một điểm gần như chắc chắn nên tách:

### Tách user view settings khỏi shared roadmap data

Các field như:

- filter
- expandedIds
- hiddenRowIds
- column widths
- timeline mode
- timeline only

không nên nằm chung với business data của roadmap.

Đây là nguồn conflict rất lớn dù dùng JSON hay table.

## Thiết kế table data mình khuyên nếu đi theo hướng này

### Bảng chính

#### `roadmaps`

- `id`
- `name`
- `created_at`
- `updated_at`

#### `roadmap_items`

- `id`
- `roadmap_id`
- `parent_id`
- `type`
- `name`
- `team_role`
- `group_item_type`
- `priority`
- `status`
- `status_mode`
- `manual_status`
- `start_date`
- `end_date`
- `quick_note`
- `sort_order`
- `created_at`
- `updated_at`
- `version` hoặc `revision`

#### `roadmap_milestones`

- `id`
- `roadmap_id`
- `label`
- `color`
- `start_date`
- `end_date`
- `sort_order`
- `updated_at`

#### `roadmap_item_images`

- `id`
- `item_id`
- `url`
- `name`
- `provider`
- `updated_at`

#### `roadmap_user_settings`

- `roadmap_id`
- `user_email` hoặc `user_id`
- `timeline_mode`
- `timeline_only`
- `column_widths`
- `filters`
- `expanded_ids`
- `hidden_row_ids`
- `updated_at`

## Mức độ an toàn theo từng mô hình

### Mô hình hiện tại: JSON blob

- concurrent safety: thấp
- implementation complexity: thấp
- flexibility: trung bình

### Table rows nhưng vẫn save snapshot

- concurrent safety: thấp đến trung bình
- implementation complexity: trung bình
- gain thực tế: không nhiều

### Table rows + row patch + version check

- concurrent safety: cao hơn rõ rệt
- implementation complexity: cao
- phù hợp multi-user hơn nhiều

## Kết luận thực tế

Nếu câu hỏi là:

> chỉ đổi từ JSON sang table thì có an toàn hơn không?

thì câu trả lời là:

**Có hơn một chút, nhưng chưa đủ để giải quyết gốc vấn đề.**

Nếu câu hỏi là:

> đổi sang table row-based và sửa luôn cách update sang patch + version check thì có an toàn hơn không?

thì câu trả lời là:

**Có, an toàn hơn đáng kể và là hướng đúng nếu muốn nhiều người cùng sửa nghiêm túc.**

## Khuyến nghị

Nếu muốn cải thiện an toàn multi-user theo thứ tự thực dụng:

1. thêm `baseVersion` + `409 conflict` cho mô hình hiện tại
2. tách `roadmap_user_settings` khỏi shared document
3. sau đó mới cân nhắc migrate `items` sang table rows
4. khi migrate thì phải đi kèm row-level patch, không chỉ đổi storage format

## Kết luận cuối

**Table data là hướng đúng hơn cho concurrent editing**, nhưng giá trị lớn nhất không nằm ở "table" mà nằm ở:

- write scope nhỏ hơn
- conflict detection tốt hơn
- transaction rõ hơn
- shared state được tách đúng chỗ

Nếu chỉ đổi storage mà không đổi write model, thì vẫn sẽ gặp các vấn đề giống hiện tại, chỉ ở dạng khác.
