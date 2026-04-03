# Remove Assigned Teams Model Plan

## Goal

Bo hoan toan `Assigned Teams` / `teamStatuses` model moi, giu lai 1 team model duy nhat:

- team ownership duoc bieu dien bang `team` row trong tree
- manager khong tao moi / khong sua structure
- manager chi duoc update mot so truong gioi han tren item thuoc team minh

Muc tieu la giam duplicated concept, don gian hoa permission, va tra ve behavior de hieu hon cho editor.

## Current State Audit

### 1. Hien tai dang co 2 team models song song

Trong [EditPopup.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/EditPopup.tsx):

- `Teams (Optional)` dung `selectedTeams`
  - luu team thanh `children` co `type: 'team'`
- `Assigned Teams` dung `assignedTeams`
  - luu team thanh metadata tren item: `assignedTeams` + `teamStatuses`

Hai model nay khong sync voi nhau.

### 2. Multi-team model dang lan ra nhieu noi trong code

- [permissions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.ts)
  - `getItemTeams()` uu tien `assignedTeams`
- [permissionCheck.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.ts)
  - manager change co nhanh write vao `teamStatuses[team]`
- [manager-save/route.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/manager-save/route.ts)
  - co nhanh save rieng cho `assignedTeams + teamStatuses`
- [roadmapHelpers.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapHelpers.ts)
  - derive overall status/date/progress tu `teamStatuses`
- [teamStatusHelpers.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/teamStatusHelpers.ts)
  - toan bo helper phuc vu model moi
- [SpreadsheetGrid.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/SpreadsheetGrid.tsx)
  - co render branch rieng cho multi-team item
- [exportToExcel.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/exportToExcel.ts)
  - co nhanh export teamStatuses
- [roadmapRows.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapRows.ts)
  - row-based serializer van mang `assignedTeams` / `teamStatuses`

### 3. Data that dang dung model nao

Da check truc tiep tren `roadmap_data.content`:

- `main`
  - `teamRows: 0`
  - `assignedTeamsItems: 0`
  - `teamStatusesItems: 0`
- `e101b240-887a-4b6f-a497-220e0ba25409`
  - `teamRows: 6`
  - `assignedTeamsItems: 0`
  - `teamStatusesItems: 0`
- `a8335e0e-55ec-42c9-920f-d64c32825cc8`
  - `teamRows: 220`
  - `assignedTeamsItems: 0`
  - `teamStatusesItems: 0`

Nhan dinh:

- du lieu thuc te hien tai dang nghieng ve legacy team-row model
- model moi dang ton tai chu yeu trong code va UI, chua thay duoc su dung that trong data hien hanh
- nhung `main` la ngoai le quan trong:
  - khong co `team row`
  - cung khong co `assignedTeams`
  - vi vay ownership cua manager tren `main` hien tai khong duoc model hoa ro rang trong data

## Manager Permission Assessment

Theo code hien tai, manager da rat gan voi scope toi gian ma user muon:

- khong tao roadmap moi
  - [page.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/page.tsx)
  - [roadmaps route](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmaps/route.ts)
- khong quan ly roadmap / khong doi ten / khong xoa / khong sua milestone
  - [permissions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.ts)
- khong mo full editor, khong add node, khong drag structure
  - [SpreadsheetGrid.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/SpreadsheetGrid.tsx)
- chi duoc sua cac field gioi han:
  - `status`
  - `startDate`
  - `endDate`
  - `quickNote`
  - [permissionCheck.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.ts)
  - [manager-save/route.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/manager-save/route.ts)

### Current Opinion

Manager scope hien tai da du chat:

- khong can mo rong them permission structure
- khong can cho manager tao moi
- huong dung la giu manager o muc:
  - chi sua field nghiep vu can thiet
  - chi tren item thuoc team minh

Phan con dang lam UI va permission tro nen roi la do `Assigned Teams` model, khong phai do manager dang co qua nhieu quyen.

## Decision

Chon 1 model duy nhat:

- giu `team row` model
- bo `assignedTeams` / `teamStatuses`

Manager ownership se duoc resolve theo:

1. item la `team` row => item do thuoc `teamRole`
2. item con nam duoi `team` row => ke thua team ancestor gan nhat
3. item khong resolve duoc team => manager khong sua duoc

## Implementation Phases

### Phase 1. Freeze the contract

- Chot lai trong code comments va plan:
  - `team row` la source of truth duy nhat cho ownership
  - manager chi sua `status/startDate/endDate/quickNote`
  - khong dung `assignedTeams` de tinh permission nua

Deliverable:

- 1 report/decision note ngan trong repo hoac update plan nay sau khi chot

### Phase 2. Remove duplicated UI

- Xoa block `Assigned Teams` khoi [EditPopup.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/EditPopup.tsx)
- Xoa state:
  - `assignedTeams`
  - `toggleAssignedTeam`
- Xoa submit logic ghi:
  - `assignedTeams`
  - `teamStatuses`

Expected outcome:

- user chi con 1 cho de gan team: `Teams (Optional)`

### Phase 3. Simplify permission resolver

- Sua [permissions.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissions.ts):
  - bo uu tien `item.assignedTeams`
  - chi resolve team theo:
    - `item.type === 'team' && item.teamRole`
    - team ancestor
- Ra soat helper wrapper nhu `getItemTeam()`

Expected outcome:

- permission de doc hon, khong con 2 semantics song song

### Phase 4. Remove multi-team manager-save path

- Sua [permissionCheck.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/permissionCheck.ts)
  - bo nhanh write vao `teamStatuses[team]`
- Sua [manager-save/route.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/app/api/roadmap/[id]/manager-save/route.ts)
  - bo nhanh patch `teamStatuses`
  - resolve ownership chi bang `teamRole` / ancestor chain

Expected outcome:

- manager save tro thanh item-level save don gian

### Phase 5. Remove derived multi-team logic

- Xoa branch multi-team trong [roadmapHelpers.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapHelpers.ts)
- Xem xet xoa hoac retire [teamStatusHelpers.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/teamStatusHelpers.ts)

Expected outcome:

- recalculate chi con dua vao tree that

### Phase 6. Remove multi-team UI/render/export branches

- Xoa branch render multi-team trong [SpreadsheetGrid.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/SpreadsheetGrid.tsx)
- Xoa nhanh export multi-team trong [exportToExcel.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/exportToExcel.ts)

Expected outcome:

- UI va export phan anh dung 1 data model duy nhat

### Phase 7. Clean row-based serialization

- Xoa `assignedTeams` / `teamStatuses` khoi [roadmapRows.ts](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/utils/roadmapRows.ts)
- Ra soat repo layer row-based neu dang map hai field nay
- Neu schema table-based da co columns JSONB lien quan, danh dau de cleanup o migration sau

Expected outcome:

- table-based path khong mang them dead fields

### Phase 8. Tests and data audit

- Update / add tests cho:
  - permission theo team ancestor
  - manager chi sua 4 fields
  - manager khong sua item ngoai team
  - editor khong con Assigned Teams UI
- Audit lai DB:
  - khong con item moi nao save ra `assignedTeams` / `teamStatuses`

## Risks

### 1. Team ownership co the bi mat o mot so item khong nam duoi team row

Neu co data dac biet ma item khong co `team` row ancestor, manager se mat quyen sua sau khi bo model moi.

Can lam:

- audit item nao hien dang sua duoc nhung khong resolve duoc team theo legacy tree
- dac biet la roadmap `main`, vi hien tai roadmap nay chua mang `team row`

### 2. Mot vai roadmap moi co the dang thu nghiem team-row rat sau

Can test voi it nhat:

- `main`
- 1 roadmap co nhieu `team` rows

### 3. Row-based branch co the van con dead columns

Neu chua cleanup schema ngay, truoc mat co the de columns ton tai nhung khong dung nua.

## Done Criteria

- UI khong con `Assigned Teams`
- code khong con depend vao `assignedTeams` / `teamStatuses` de tinh permission va manager-save
- manager scope van giu nguyen:
  - khong create
  - khong structure
  - chi update `status/startDate/endDate/quickNote`
- cac roadmap hien tai van load/save dung
- test permission regression pass
