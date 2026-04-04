# Show Reported Button In Table Mode Plan

## Goal

Tach nut `Reported` ra rieng cho roadmap che do `table`, va dat no:

- sau cum `Expand/Collapse`
- truoc nut `Timeline Only`

Muc tieu la de user de thay va de bat `Reported mode` hon trong table mode, thay vi bi an ben trong quick-view chi danh cho json mode.

## Current State

Trong [Toolbar.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/Toolbar.tsx):

- `QuickViewMode = 'web' | 'app' | 'reported'`
- khi `isJsonMode === true`
  - toolbar render cum `Web / App / Reported`
- khi `isJsonMode === false`
  - toolbar render `QuickFilterStatus / QuickFilterTeam / QuickFilterPriority`
  - va khong co nut `Reported` rieng

Nghia la:

- `Reported mode` da co logic
- nhung trong `table mode`, user khong co nut UI ro rang o khu vuc toolbar chinh de bat no

## Desired UX

Khi roadmap dang o `table mode`:

- hien 1 nut `Reported`
- dat ngay sau cum `Expand all / Collapse all`
- dat truoc nut `Timeline Only`

Khi roadmap dang o `json mode`:

- giu nguyen cum `Web / App / Reported` hien tai
- khong can doi layout cu

## Implementation Scope

### Phase 1. Add dedicated Reported button for table mode

Sua [Toolbar.tsx](/Users/nguyenminhtri/.gemini/antigravity/scratch/roadmap-tool/src/components/Toolbar.tsx):

- trong branch `!isJsonMode`
- chen them 1 nut `Reported`
- vi tri:
  - sau cum `Expand/Collapse All`
  - truoc `Timeline Only`

Nut nay se:

- goi `onToggleQuickViewMode('reported')`
- highlight khi `isReportedMode === true`

### Phase 2. Keep current behavior contract

Khong doi logic core cua reported mode:

- reported mode van dung `onToggleQuickViewMode('reported')`
- timeline only van bi disable khi dang o reported mode
- reported mode exit behavior van nhu hien tai

Muc tieu la chi doi UI discoverability, khong doi flow nghiep vu.

### Phase 3. Avoid duplicate buttons in the same mode

Rule:

- `json mode`
  - van dung cum `Web / App / Reported`
- `table mode`
  - khong render cum quick-view cu
  - chi render nut `Reported` rieng o vi tri moi

De tranh:

- 2 nut `Reported` cung luc
- nguoi dung khong hieu button nao la dung

## UI Notes

Nut `Reported` moi nen follow cung visual language voi `Timeline Only`:

- size cung hang
- border/button state ro rang
- active state de nhan biet khi dang o reported mode

Khuyen nghi:

- inactive: `border-slate-200 bg-white text-slate-600`
- active: dung tông `#F0B90B` giong quick-view active hien tai

## Risks

### 1. Table mode co the dang khong ho tro reported flow day du

Can verify:

- bam `Reported` trong table mode co vao dung reported screen/state khong
- filter/panel khac co bi xung dot khong

### 2. Placement may crowd toolbar

Vi tri moi nam giua `Collapse` va `Timeline Only`, can kiem tra:

- desktop width thong thuong
- khong vo layout khi title roadmap dai

### 3. State duplication in the future

Neu sau nay doi quick-filter layout nua, can giu 1 rule ro:

- json mode: quick-view buttons
- table mode: standalone `Reported`

## Acceptance Criteria

- table mode hien nut `Reported`
- nut nam sau `Collapse all` va truoc `Timeline Only`
- bam nut vao reported mode dung
- active state nhin ro
- khong co duplicate `Reported` button trong cung 1 mode
- build pass

## Recommendation

Nen lam nho va an toan:

1. chi them nut `Reported` rieng trong table mode
2. khong doi logic reported mode
3. neu sau khi dung thay hop ly, moi can nhac doi tiep quick filter layout
