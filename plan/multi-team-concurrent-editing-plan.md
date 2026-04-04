# Multi-Team Data Model & Concurrent Editing — Implementation Plan

**Ngày tạo:** 2026-04-02
**Project:** Roadmap Tool (Next.js 16 + React 19 + TypeScript + Supabase)
**Mục đích:** Cho phép gán nhiều team vào bất kỳ cấp nào trong hierarchy, mỗi team có status/dates riêng, nhiều manager có thể chỉnh sửa đồng thời mà không mất dữ liệu.

> **Cross-dependency:**
> - **team-permission-plan:** Plan này mở rộng `ManagerFieldChange` và permission logic từ team-permission-plan. Triển khai sau hoặc cùng lúc Phase 1-3 của team-permission-plan.
> - **planned-vs-actual:** Tương thích hoàn toàn — `plannedStartDate`/`plannedEndDate` có thể nằm trong `TeamStatusEntry` per-team.

---

## Bài Toán

### Hiện trạng

```
Group: "Đăng nhập"
  ├─ Team: FE (teamRole='FE')         ← container cứng
  │    └─ Item: "Build login form"
  └─ Team: BE (teamRole='BE')         ← container cứng
       └─ Item: "Create auth API"
```

- `teamRole` chỉ có ở node `type === 'team'` — là container, không phải task
- Mỗi item chỉ có **1 status**, **1 startDate/endDate**
- Nếu FE và BE cùng làm 1 task → phải tách thành 2 container riêng
- Permission dựa vào team node cha gần nhất (`getItemTeam()` walk lên cây)

### Mục tiêu

```
Group: "Đăng nhập" (assignedTeams: ['FE', 'BE'])
  └─ Item: "Build + integrate login" (assignedTeams: ['FE', 'BE'])
       teamStatuses:
         FE: { status: 'FE Done',  startDate: '04-01', endDate: '04-05' }
         BE: { status: 'BE Start', startDate: '04-03', endDate: '04-08' }
```

- Bất kỳ cấp nào cũng gán được team (category, group, item...)
- Mỗi team có status/dates/notes riêng → **không conflict khi save đồng thời**
- Items cũ (không có `teamStatuses`) vẫn hoạt động bình thường (backward compatible)

---

## Phân Tích Concurrent Editing

### Tại sao `teamStatuses` giải quyết concurrent editing?

```
TRƯỚC (1 field status duy nhất):
  FE save: { status: "FE Done" }     ← ghi đè
  BE save: { status: "BE Start" }    ← ghi đè FE → MẤT DATA

SAU (mỗi team 1 namespace):
  FE save: { teamStatuses.FE.status: "FE Done" }     ← ghi vào key FE
  BE save: { teamStatuses.BE.status: "BE Start" }    ← ghi vào key BE
  → CẢ HAI ĐỀU GIỮ, không conflict
```

Kết hợp với **retry mechanism** trên manager-save route: nếu 2 manager save cùng lúc, server đọc bản mới nhất từ DB → apply changes vào namespace riêng → save lại. Retry tối đa 3 lần — an toàn 100%.

### Ma trận an toàn

| Tình huống | Trước (single status) | Sau (teamStatuses) |
|---|---|---|
| FE + BE sửa cùng item, khác team | ❌ Conflict, mất data | ✅ Mỗi team ghi namespace riêng |
| FE + FE sửa cùng item (hiếm) | ❌ Last write wins | ⚠️ Last write wins (acceptable — cùng team) |
| Admin + Manager sửa cùng item | ❌ Conflict | ✅ Admin sửa overall, manager sửa team namespace |
| 3+ manager sửa cùng lúc | ❌ Chỉ 1 người thành công | ✅ Tất cả thành công (retry + khác namespace) |

---

## Thiết Kế Kỹ Thuật

### Phase 1: Data Model (2-3 giờ)

#### 1.1 Thêm types mới

**File:** `src/types/roadmap.ts`

```typescript
// === MỚI: Per-team status entry ===
export interface TeamStatusEntry {
  status: ItemStatus;
  statusMode?: StatusMode;       // auto | manual per team
  manualStatus?: ItemStatus;
  startDate?: string;
  endDate?: string;
  quickNote?: string;
  // Tích hợp planned-vs-actual (nếu triển khai cùng)
  plannedStartDate?: string;
  plannedEndDate?: string;
}

export interface RoadmapItem {
  // ... giữ nguyên TẤT CẢ fields cũ (backward compatible) ...
  id: string;
  name: string;
  type: ItemType;
  teamRole?: TeamRole;            // giữ lại cho team-type nodes cũ
  status: ItemStatus;             // overall status (derived)
  statusMode?: StatusMode;
  manualStatus?: ItemStatus;
  progress: number;
  startDate?: string;             // overall dates (derived)
  endDate?: string;
  priority?: ItemPriority;
  quickNote?: string;
  // ... other existing fields ...

  // === MỚI ===
  assignedTeams?: TeamRole[];     // teams gán cho item này
  teamStatuses?: Partial<Record<TeamRole, TeamStatusEntry>>;
}
```

**Nguyên tắc backward compatible:**
- Nếu `assignedTeams` undefined → hoạt động như cũ (dùng team-node cha)
- Nếu `teamStatuses` undefined → dùng `status`/`startDate`/`endDate` trực tiếp
- Fields cũ (`status`, `startDate`, `endDate`) trở thành **derived values** khi có `teamStatuses`

#### 1.2 Derive overall values từ teamStatuses

**File mới:** `src/utils/teamStatusHelpers.ts`

```typescript
import { RoadmapItem, TeamStatusEntry, TeamRole, ItemStatus } from '@/types/roadmap';

/**
 * Kiểm tra item có dùng multi-team model không.
 */
export function isMultiTeamItem(item: RoadmapItem): boolean {
  return !!(item.assignedTeams && item.assignedTeams.length > 0 && item.teamStatuses);
}

/**
 * Derive overall status từ teamStatuses.
 * Logic: dùng deriveStatusFromChildren logic hiện tại,
 * nhưng input là các team status thay vì children status.
 */
export function deriveOverallStatus(
  teamStatuses: Partial<Record<TeamRole, TeamStatusEntry>>
): ItemStatus {
  const statuses = Object.values(teamStatuses)
    .filter((ts): ts is TeamStatusEntry => !!ts)
    .map(ts => ts.status);

  if (statuses.length === 0) return 'None';

  // Reuse logic từ deriveStatusFromChildren
  // All done → done, all not started → not started, else → highest priority in-progress
  // (import và gọi hàm chung)
  return deriveFromStatuses(statuses);
}

/**
 * Derive overall dates từ teamStatuses.
 * startDate = earliest team startDate
 * endDate = latest team endDate
 */
export function deriveOverallDates(
  teamStatuses: Partial<Record<TeamRole, TeamStatusEntry>>
): { startDate?: string; endDate?: string } {
  const entries = Object.values(teamStatuses).filter((ts): ts is TeamStatusEntry => !!ts);
  const starts = entries.map(ts => ts.startDate).filter(Boolean) as string[];
  const ends = entries.map(ts => ts.endDate).filter(Boolean) as string[];

  return {
    startDate: starts.length > 0 ? starts.sort()[0] : undefined,
    endDate: ends.length > 0 ? ends.sort().reverse()[0] : undefined,
  };
}

/**
 * Derive overall progress từ teamStatuses.
 */
export function deriveOverallProgress(
  teamStatuses: Partial<Record<TeamRole, TeamStatusEntry>>
): number {
  const entries = Object.values(teamStatuses).filter((ts): ts is TeamStatusEntry => !!ts);
  if (entries.length === 0) return 0;
  const progressPerTeam = entries.map(ts => statusToProgress(ts.status));
  return Math.round(progressPerTeam.reduce((a, b) => a + b, 0) / entries.length);
}
```

#### 1.3 Cập nhật recalculateItem()

**File:** `src/utils/roadmapHelpers.ts`

```typescript
const recalculateItem = (rawItem: RoadmapItem): RoadmapItem => {
  const item = stripTransientFields(rawItem);

  // === MỚI: xử lý multi-team items ===
  if (isMultiTeamItem(item) && item.teamStatuses) {
    const overallStatus = deriveOverallStatus(item.teamStatuses);
    const overallDates = deriveOverallDates(item.teamStatuses);
    const overallProgress = deriveOverallProgress(item.teamStatuses);

    return {
      ...item,
      status: overallStatus,
      startDate: overallDates.startDate,
      endDate: overallDates.endDate,
      progress: overallProgress,
      // Recalculate children nếu có
      ...(item.children ? { children: item.children.map(recalculateItem) } : {}),
    };
  }

  // === Logic cũ giữ nguyên cho single-team items ===
  const hasChildren = !!(item.children && item.children.length > 0);
  // ... existing code ...
};
```

#### 1.4 Checklist Phase 1

- [ ] Thêm `TeamStatusEntry` interface vào `roadmap.ts`
- [ ] Thêm `assignedTeams` và `teamStatuses` vào `RoadmapItem`
- [ ] Tạo `src/utils/teamStatusHelpers.ts` với derive functions
- [ ] Cập nhật `recalculateItem()` để xử lý multi-team
- [ ] Verify: items cũ (không có teamStatuses) vẫn hoạt động bình thường
- [ ] Verify: save + load giữ đúng `teamStatuses` trong JSON document

---

### Phase 2: Permission & Validation (2-3 giờ)

#### 2.1 Mở rộng getItemTeam() → getItemTeams()

**File:** `src/utils/permissions.ts`

```typescript
/**
 * Trả về TẤT CẢ teams mà item thuộc về.
 *
 * Ưu tiên:
 * 1. item.assignedTeams (nếu có) → trả về trực tiếp
 * 2. item.type === 'team' && item.teamRole → trả về [teamRole]
 * 3. Walk lên parent → tìm team-node cha gần nhất (logic cũ)
 */
export function getItemTeams(
  itemId: ItemId,
  items: RoadmapItem[],
  parentTeam?: RoadmapTeamRole
): RoadmapTeamRole[] {
  for (const item of items) {
    const currentTeam = item.type === 'team' && item.teamRole
      ? item.teamRole
      : parentTeam;

    if (item.id === itemId) {
      // Ưu tiên assignedTeams nếu có
      if (item.assignedTeams && item.assignedTeams.length > 0) {
        return item.assignedTeams;
      }
      // Fallback: team-node cha gần nhất
      return currentTeam ? [currentTeam] : [];
    }

    if (item.children?.length) {
      const found = getItemTeams(itemId, item.children, currentTeam);
      if (found.length > 0) return found;
    }
  }

  return [];
}

// Giữ getItemTeam() cũ cho backward compat, delegate sang getItemTeams()
export function getItemTeam(
  itemId: ItemId,
  items: RoadmapItem[],
  parentTeam?: RoadmapTeamRole
): RoadmapTeamRole | null {
  const teams = getItemTeams(itemId, items, parentTeam);
  return teams[0] || null;
}
```

#### 2.2 Mở rộng getEditPermission()

```typescript
export function getEditPermission(
  user: SessionUser | null,
  itemId: ItemId,
  items: RoadmapItem[]
): EditPermission {
  if (!user) return NONE_PERMISSION;
  if (isAdminLevel(user)) return FULL_PERMISSION;

  if (user.role === 'manager' && user.team) {
    const itemTeams = getItemTeams(itemId, items);

    // Manager có quyền nếu team mình nằm trong assignedTeams của item
    if (itemTeams.includes(user.team as RoadmapTeamRole)) {
      return {
        canEditStatus: true,
        canEditDates: true,
        canEditNotes: true,
        canEditStructure: false,
        canEditMilestones: false,
        canManageRoadmap: false,
      };
    }
  }

  return NONE_PERMISSION;
}
```

#### 2.3 Mở rộng ManagerFieldChange

**File:** `src/types/auth.ts`

```typescript
export interface ManagerFieldChange {
  itemId: string;
  team: TeamRole;                    // ← MỚI: team nào đang sửa
  field: 'status' | 'startDate' | 'endDate' | 'quickNote';
  value: string | null;
}
```

Thêm `team` field để server biết ghi vào `teamStatuses[team]` nào.

#### 2.4 Cập nhật validateManagerChanges()

**File:** `src/utils/permissionCheck.ts`

```typescript
export function validateManagerChanges(
  managerTeam: AuthManagerTeam,
  changes: ManagerFieldChange[],
  items: RoadmapItem[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const change of changes) {
    // Validate field
    if (!ALLOWED_MANAGER_FIELDS.includes(change.field)) {
      violations.push(`Field "${change.field}" không được phép`);
      continue;
    }

    // Validate: change.team phải khớp managerTeam
    if (change.team !== managerTeam) {
      violations.push(`Manager ${managerTeam} không thể sửa team ${change.team}`);
      continue;
    }

    // Validate: item phải thuộc team đó
    const itemTeams = getItemTeams(change.itemId, items);
    if (!itemTeams.includes(change.team)) {
      violations.push(
        `Item ${change.itemId} thuộc teams [${itemTeams.join(', ')}], ` +
        `không bao gồm ${change.team}`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}
```

#### 2.5 Cập nhật applyChangesToTree()

**File:** `src/utils/permissionCheck.ts`

```typescript
export function applyChangesToTree(
  items: RoadmapItem[],
  changes: ManagerFieldChange[]
): RoadmapItem[] {
  // Group changes by itemId
  const changesByItem = new Map<string, ManagerFieldChange[]>();
  for (const change of changes) {
    const list = changesByItem.get(change.itemId) || [];
    list.push(change);
    changesByItem.set(change.itemId, list);
  }

  const applyToItem = (item: RoadmapItem): RoadmapItem => {
    let updated = { ...item };

    const itemChanges = changesByItem.get(item.id);
    if (itemChanges) {
      for (const change of itemChanges) {
        const team = change.team;

        if (isMultiTeamItem(updated) || updated.assignedTeams?.includes(team)) {
          // === Multi-team path: ghi vào teamStatuses[team] ===
          const currentTeamStatus: TeamStatusEntry =
            updated.teamStatuses?.[team] || { status: 'None' };

          let newTeamStatus = { ...currentTeamStatus };

          if (change.field === 'status') {
            newTeamStatus = {
              ...newTeamStatus,
              statusMode: 'manual',
              manualStatus: change.value as ItemStatus,
              status: change.value as ItemStatus,
            };
          } else if (change.field === 'startDate') {
            newTeamStatus.startDate = change.value || undefined;
          } else if (change.field === 'endDate') {
            newTeamStatus.endDate = change.value || undefined;
          } else if (change.field === 'quickNote') {
            newTeamStatus.quickNote = change.value || undefined;
          }

          updated = {
            ...updated,
            teamStatuses: {
              ...updated.teamStatuses,
              [team]: newTeamStatus,
            },
          };
        } else {
          // === Legacy path: ghi trực tiếp vào item (backward compat) ===
          if (change.field === 'status') {
            updated = {
              ...updated,
              statusMode: 'manual',
              manualStatus: change.value as ItemStatus,
              status: change.value as ItemStatus,
            };
          } else if (change.field === 'startDate') {
            updated = { ...updated, startDate: change.value || undefined };
          } else if (change.field === 'endDate') {
            updated = { ...updated, endDate: change.value || undefined };
          } else if (change.field === 'quickNote') {
            updated = { ...updated, quickNote: change.value || undefined };
          }
        }
      }
    }

    if (item.children) {
      updated.children = item.children.map(applyToItem);
    }

    return updated;
  };

  return items.map(applyToItem);
}
```

#### 2.6 Checklist Phase 2

- [ ] Thêm `getItemTeams()` → trả về `TeamRole[]`
- [ ] Cập nhật `getItemTeam()` delegate sang `getItemTeams()`
- [ ] Thêm `team: TeamRole` vào `ManagerFieldChange`
- [ ] Cập nhật `validateManagerChanges()` dùng `getItemTeams()` + check `change.team`
- [ ] Cập nhật `applyChangesToTree()` ghi vào `teamStatuses[team]`
- [ ] Cập nhật `getEditPermission()` dùng `itemTeams.includes()`
- [ ] Tests cho tất cả functions mới
- [ ] Verify: items cũ (không có assignedTeams) vẫn qua validation bình thường

---

### Phase 3: Manager-Save Route + Retry (2-3 giờ)

#### 3.1 Thêm retry mechanism

**File:** `src/app/api/roadmap/[id]/manager-save/route.ts`

```typescript
const MAX_RETRY = 3;

export async function POST(req: Request, { params }: RouteParams) {
  // Auth + parse request (giữ nguyên)
  const auth = await authenticateTeamRequest(req, supabase);
  const { changes } = await parseManagerSaveRequest(req);
  const managerTeam = auth.member.team;

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < MAX_RETRY) {
    attempt++;

    // 1. Đọc document MỚI NHẤT từ DB
    const { data: row } = await supabase
      .from('roadmap_data')
      .select('content, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const currentDoc = row.content as RoadmapDocument;
    const currentVersion = row.updated_at;
    const currentItems = currentDoc.items;

    // 2. Validate changes (đọc mới nhất nên luôn chính xác)
    const validation = validateManagerChanges(managerTeam, changes, currentItems);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Validation failed',
        violations: validation.violations,
      }, { status: 403 });
    }

    // 3. Apply changes → recalculate
    const updatedItems = applyChangesToTree(currentItems, changes);
    const recalculatedItems = recalculateRoadmap(updatedItems);

    const savedDoc: RoadmapDocument = {
      ...sanitizeSharedRoadmapDocument(currentDoc),
      items: recalculatedItems,
    };

    // 4. Conditional update (optimistic lock)
    const updatedAt = new Date().toISOString();
    const { data: savedRow } = await supabase
      .from('roadmap_data')
      .update({ content: savedDoc, updated_at: updatedAt })
      .eq('id', id)
      .eq('updated_at', currentVersion)     // ← condition
      .select('updated_at')
      .maybeSingle();

    if (savedRow) {
      // THÀNH CÔNG
      return NextResponse.json({
        success: true,
        document: savedDoc,
        updatedAt: savedRow.updated_at,
      });
    }

    // Conditional update thất bại → có người khác save trước
    // Retry: đọc lại bản mới nhất, apply lại changes
    lastError = `Attempt ${attempt}: version conflict, retrying...`;
  }

  // Hết retry
  return NextResponse.json({
    error: 'Không thể lưu sau nhiều lần thử. Vui lòng tải lại trang.',
    code: 'RETRY_EXHAUSTED',
    details: lastError,
  }, { status: 409 });
}
```

#### 3.2 Tại sao retry an toàn?

```
Attempt 1:
  Server đọc DB version 10:01
  Apply: { teamStatuses.FE.status = "FE Done" }
  Save → THẤT BẠI (version đã là 10:02 do BE vừa save)

Attempt 2 (retry):
  Server đọc DB version 10:02 ← ĐÃ CÓ thay đổi của BE
  Apply: { teamStatuses.FE.status = "FE Done" } ← CÙNG changes
  Save → THÀNH CÔNG ✓

Kết quả cuối: cả FE lẫn BE đều được lưu
  teamStatuses.FE = { status: "FE Done" }   ✓
  teamStatuses.BE = { status: "BE Start" }  ✓
```

**An toàn vì:**
1. Changes là **declarative** — "set FE status = X" — apply lên bản nào cũng đúng
2. Mỗi team ghi vào **namespace riêng** — không ghi đè lẫn nhau
3. Server luôn đọc **bản mới nhất** trước khi apply

#### 3.3 Cập nhật client gửi team context

**File:** `src/components/SpreadsheetGrid.tsx` — nơi tạo ManagerFieldChange

```typescript
// Trước:
const change: ManagerFieldChange = {
  itemId: row.id,
  field: 'status',
  value: newStatus,
};

// Sau:
const change: ManagerFieldChange = {
  itemId: row.id,
  team: currentUser.team,          // ← MỚI
  field: 'status',
  value: newStatus,
};
```

#### 3.4 Cập nhật Realtime version sync

**File:** `src/app/roadmap/[id]/page.tsx`

```typescript
// Hiện tại: chỉ hiện toast khi có update từ người khác
// Cải thiện: cập nhật currentVersionRef ngay khi nhận realtime

.on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {
  const newVersion = payload.new?.updated_at;
  if (newVersion) {
    // Cập nhật version ref để lần save tiếp theo dùng version mới
    currentVersionRef.current = newVersion;
  }
  setHasUnsavedSharedChanges(true);
  addToast('Roadmap đã được cập nhật bởi người khác.', 'info');
})
```

#### 3.5 Checklist Phase 3

- [ ] Thêm retry loop (MAX_RETRY = 3) vào manager-save route
- [ ] Giữ nguyên validation bên trong loop (validate trên data mới nhất)
- [ ] Client gửi `team` trong mỗi `ManagerFieldChange`
- [ ] Cập nhật realtime handler sync `currentVersionRef`
- [ ] Test: 2 manager save cùng lúc → cả 2 thành công
- [ ] Test: retry exhausted → trả 409 với message rõ ràng
- [ ] Test: validation fail → không retry, trả 403 ngay

---

### Phase 4: UI — Gán Team & Hiển Thị Multi-Status (3-4 giờ)

#### 4.1 Gán team cho item ở bất kỳ cấp nào

**File:** `src/components/EditPopup.tsx`

Hiện tại chỉ cho gán team khi `item.type === 'item' || item.type === 'group'`, và tạo team-node container. Thay đổi:

```typescript
// Thêm section "Assigned Teams" cho TẤT CẢ item types
// (trừ type === 'team' — đây là container cũ, giữ nguyên)

{item.type !== 'team' && (
  <div className="mt-3">
    <label className="text-xs font-medium text-gray-500">Assigned Teams</label>
    <div className="flex flex-wrap gap-1.5 mt-1">
      {TEAM_ROLES.map(role => (
        <button
          key={role}
          onClick={() => toggleAssignedTeam(role)}
          className={`px-2 py-0.5 text-xs rounded-full border transition-colors
            ${assignedTeams.has(role)
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}
        >
          {role}
        </button>
      ))}
    </div>
  </div>
)}
```

Khi save EditPopup:

```typescript
const handleSave = () => {
  const updated: RoadmapItem = {
    ...item,
    assignedTeams: Array.from(assignedTeams),
    // Khởi tạo teamStatuses cho teams mới
    teamStatuses: buildTeamStatuses(item.teamStatuses, assignedTeams),
  };
  onSave(updated);
};

function buildTeamStatuses(
  existing: Partial<Record<TeamRole, TeamStatusEntry>> | undefined,
  teams: Set<TeamRole>
): Partial<Record<TeamRole, TeamStatusEntry>> {
  const result: Partial<Record<TeamRole, TeamStatusEntry>> = {};
  for (const team of teams) {
    result[team] = existing?.[team] || { status: 'Not Started' };
  }
  return result;
}
```

#### 4.2 Hiển thị multi-status trong SpreadsheetGrid

**File:** `src/components/SpreadsheetGrid.tsx`

Thay vì 1 status dropdown, hiển thị multi-status chips:

```typescript
// Cột Status — khi item có teamStatuses
{isMultiTeamItem(row) ? (
  <div className="flex flex-col gap-0.5">
    {row.assignedTeams?.map(team => {
      const ts = row.teamStatuses?.[team];
      const canEdit = currentUser?.team === team || isAdminLevel(currentUser);
      return (
        <div key={team} className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 w-6">{team}</span>
          {canEdit ? (
            <StatusDropdown
              value={ts?.status || 'None'}
              onChange={(newStatus) => handleTeamStatusChange(row.id, team, newStatus)}
              teamFilter={team}   // Chỉ hiện status options của team đó
            />
          ) : (
            <StatusBadge status={ts?.status || 'None'} size="xs" />
          )}
        </div>
      );
    })}
  </div>
) : (
  // Single status — giữ nguyên logic cũ
  <StatusDropdown value={row.status} onChange={...} />
)}
```

#### 4.3 Status dropdown chỉ hiện options của team tương ứng

```typescript
// Hiện tại: dropdown hiện TẤT CẢ 25+ statuses
// Cải thiện: filter theo team

const STATUS_OPTIONS_BY_TEAM: Record<TeamRole, ItemStatus[]> = {
  FE: ['None', 'Not Started', 'FE Handle', 'FE Start', 'FE Done'],
  BE: ['None', 'Not Started', 'BE Handle', 'BE Start', 'BE Done'],
  QC: ['None', 'Not Started', 'QC Handle', 'QC Start', 'QC Done - Staging', 'QC Done - Pro'],
  PD: ['None', 'Not Started', 'PD Handle', 'PD Start UI/UX', 'PD Start Visual', 'PD Done UI/UX', 'PD Done Visual'],
  BA: ['None', 'Not Started', 'BA Handle', 'BA Start', 'BA Done'],
  DevOps: ['None', 'Not Started', 'DevOps Handle', 'DevOps Start', 'DevOps Done'],
  Growth: ['None', 'Not Started', 'Growth Handle', 'Growth Start', 'Growth Done'],
};
```

#### 4.4 Date editing per-team

Khi item có teamStatuses, cột startDate/endDate hiện **per-team dates**:

```typescript
// Cột StartDate — multi-team mode
{isMultiTeamItem(row) ? (
  <div className="flex flex-col gap-0.5">
    {row.assignedTeams?.map(team => {
      const ts = row.teamStatuses?.[team];
      const canEdit = currentUser?.team === team || isAdminLevel(currentUser);
      return (
        <div key={team} className="flex items-center gap-1 text-[11px]">
          <span className="text-gray-400 w-6">{team}</span>
          {canEdit ? (
            <DateMiniPopup
              value={ts?.startDate}
              onChange={(date) => handleTeamDateChange(row.id, team, 'startDate', date)}
            />
          ) : (
            <span>{ts?.startDate ? format(parseISO(ts.startDate), 'dd/MM') : '—'}</span>
          )}
        </div>
      );
    })}
  </div>
) : (
  // Single date — giữ nguyên
  <DateMiniPopup value={row.startDate} ... />
)}
```

#### 4.5 Checklist Phase 4

- [ ] Thêm "Assigned Teams" UI trong EditPopup cho mọi item type
- [ ] `buildTeamStatuses()` khởi tạo TeamStatusEntry khi gán team mới
- [ ] Multi-status chips trong SpreadsheetGrid cột Status
- [ ] `STATUS_OPTIONS_BY_TEAM` filter — mỗi team chỉ thấy status của mình
- [ ] Date editing per-team (startDate, endDate)
- [ ] QuickNote per-team (nếu cần)
- [ ] Admin-level: có thể sửa status/dates của BẤT KỲ team nào
- [ ] Manager-level: chỉ sửa team mình, các team khác read-only
- [ ] Verify: items cũ (không có assignedTeams) hiển thị single status như cũ

---

### Phase 5: Timeline — Multi-Team Arcs (2-3 giờ)

#### 5.1 Render 1 arc per team

Khi item có `teamStatuses`, timeline hiện **nhiều arc**, mỗi arc đại diện 1 team:

```
  ╭──── FE ────╮                    ← FE arc (xanh dương #3b82f6)
  ╰────────────╯
     ╭───── BE ─────────╮           ← BE arc (xanh lá #10b981)
     ╰──────────────────╯
        ╭── QC ──╮                  ← QC arc (hồng #ec4899)
        ╰────────╯
```

#### 5.2 Dynamic row height

```typescript
const getRowHeight = (item: RoadmapItem): number => {
  if (!isMultiTeamItem(item)) return BASE_ROW_HEIGHT; // 28px

  const teamCount = item.assignedTeams?.length || 1;
  // Mỗi team arc cao 20px, padding 4px
  return Math.max(BASE_ROW_HEIGHT, teamCount * 20 + 8);
};
```

#### 5.3 Layered arc rendering

```typescript
// Trong phần render timeline bars:
if (isMultiTeamItem(row) && row.assignedTeams && row.teamStatuses) {
  const teamCount = row.assignedTeams.length;
  const arcHeight = Math.floor((rowHeight - 8) / teamCount);

  return row.assignedTeams.map((team, index) => {
    const ts = row.teamStatuses?.[team];
    if (!ts?.startDate || !ts?.endDate) return null;

    const color = STATUS_BAR_COLOR[ts.status] || '#9ca3af';
    const top = 4 + index * arcHeight;

    return (
      <div key={team} style={{ position: 'absolute', top, height: arcHeight }}>
        <TimelineArc
          left={calcLeft(ts.startDate)}
          width={calcWidth(ts.startDate, ts.endDate)}
          rowHeight={arcHeight}
          color={color}
          isActive={activeItemId === row.id}
        />
        {/* Team label nhỏ ở đầu arc */}
        <span className="absolute text-[8px] text-gray-400 font-medium"
              style={{ left: calcLeft(ts.startDate) - 16, top: arcHeight / 2 - 5 }}>
          {team}
        </span>
      </div>
    );
  });
}
```

#### 5.4 Tích hợp Planned vs Actual (nếu triển khai cùng)

Khi cả `teamStatuses` và `plannedStartDate`/`plannedEndDate` đều có:

```
  ╭── FE plan ──╮ (đứt, xám)      ← planned
  ╭──── FE actual ────╮ (liền)     ← actual
  ╰───────────────────╯

  ╭── BE plan ──╮ (đứt, xám)
  ╭── BE actual ──╮ (liền)
  ╰───────────────╯
```

Mỗi team có cặp planned+actual riêng. `TeamStatusEntry` đã có `plannedStartDate`/`plannedEndDate`.

#### 5.5 Checklist Phase 5

- [ ] `getRowHeight()` dynamic theo số teams
- [ ] Render multi-arc: mỗi team 1 arc với màu tương ứng
- [ ] Team label nhỏ ở đầu mỗi arc
- [ ] Items cũ (single team) → render arc đơn như cũ
- [ ] Tích hợp planned vs actual per-team (nếu triển khai cùng)
- [ ] Hover tooltip hiện team + status + dates
- [ ] Performance: chỉ render arcs cho visible rows (virtual scroll)

---

### Phase 6: Migration & Backward Compatibility (1-2 giờ)

#### 6.1 Strategy: Lazy migration, không cần DB script

- `teamStatuses` là optional field trong JSON document
- Items cũ không có field này → code tự fallback về logic cũ
- Khi admin edit item cũ và gán teams → `teamStatuses` được tạo lần đầu
- Không cần migration script

#### 6.2 Xử lý team-node containers cũ

Items cũ dùng team-node container (`type === 'team'`):

```
Group: "Login"
  ├─ Team: FE (type='team', teamRole='FE')   ← container cũ
  │    └─ Item: "Build form"
  └─ Team: BE (type='team', teamRole='BE')
       └─ Item: "Create API"
```

**Không cần migrate.** Team-node containers vẫn hoạt động:
- `getItemTeams()` fallback: walk lên cây tìm team-node cha
- Items bên trong team-node không cần `assignedTeams` — team được infer từ parent
- Chỉ khi muốn gán multi-team ở cấp item mới cần `assignedTeams`

#### 6.3 Normalize function

**File:** `src/utils/teamStatusHelpers.ts`

```typescript
/**
 * Normalize item khi load: đảm bảo teamStatuses khớp assignedTeams.
 * Gọi trong normalizeRoadmapDocument().
 */
export function normalizeTeamStatuses(item: RoadmapItem): RoadmapItem {
  if (!item.assignedTeams || item.assignedTeams.length === 0) {
    // Không có assignedTeams → xóa teamStatuses nếu có (cleanup)
    const { teamStatuses, assignedTeams, ...rest } = item;
    return rest as RoadmapItem;
  }

  // Đảm bảo mỗi assigned team có entry trong teamStatuses
  const ts: Partial<Record<TeamRole, TeamStatusEntry>> = {};
  for (const team of item.assignedTeams) {
    ts[team] = item.teamStatuses?.[team] || { status: 'Not Started' };
  }

  return { ...item, teamStatuses: ts };
}
```

#### 6.4 Cập nhật roadmapRows flattening

**File:** `src/utils/roadmapRows.ts`

```typescript
// Flattening: thêm assignedTeams + teamStatuses vào FlattenedItem
items.push({
  // ... existing fields ...
  assignedTeams: item.assignedTeams,
  teamStatuses: item.teamStatuses,
});

// Unflattening: restore từ FlattenedItem
const restored: RoadmapItem = {
  // ... existing fields ...
  ...(row.assignedTeams ? { assignedTeams: row.assignedTeams } : {}),
  ...(row.teamStatuses ? { teamStatuses: row.teamStatuses } : {}),
};
```

#### 6.5 Cập nhật export

**File:** `src/utils/exportToExcel.ts`

Khi export Excel, multi-team item hiện dạng:
```
Status: "FE: FE Done | BE: BE Start"
Start:  "FE: 01/04 | BE: 03/04"
End:    "FE: 05/04 | BE: 08/04"
```

#### 6.6 Checklist Phase 6

- [ ] Verify: load roadmap cũ (không có teamStatuses) → hoạt động bình thường
- [ ] `normalizeTeamStatuses()` cleanup khi load
- [ ] roadmapRows flattening/unflattening hỗ trợ fields mới
- [ ] Export Excel hiển thị multi-team status
- [ ] Team-node containers cũ vẫn hoạt động song song
- [ ] Không cần DB migration script

---

### Phase 7: Testing & QA (2-3 giờ)

#### 7.1 Unit Tests

| Test | Input | Expected |
|------|-------|----------|
| `isMultiTeamItem()` | item có assignedTeams + teamStatuses | `true` |
| `isMultiTeamItem()` | item không có assignedTeams | `false` |
| `deriveOverallStatus()` | FE Done + BE Start | highest priority in-progress |
| `deriveOverallDates()` | FE: 01-05, BE: 03-08 | start: 01, end: 08 |
| `getItemTeams()` | item có assignedTeams: [FE, BE] | `['FE', 'BE']` |
| `getItemTeams()` | item trong team-node FE (cũ) | `['FE']` |
| `validateManagerChanges()` | FE manager sửa item [FE, BE] | valid ✅ |
| `validateManagerChanges()` | FE manager sửa item [BE] only | rejected ❌ |
| `applyChangesToTree()` | FE sửa status trên multi-team item | `teamStatuses.FE.status` updated |
| `applyChangesToTree()` | FE sửa status trên legacy item | `item.status` updated (backward compat) |

#### 7.2 Integration Tests — Concurrent Editing

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | 2 manager cùng sửa 1 item, khác team | FE: status=FE Done, BE: status=BE Start, cùng lúc | Cả hai thành công (retry) |
| 2 | 3 manager cùng sửa 1 item | FE+BE+QC save đồng thời | Tất cả thành công trong 3 retry |
| 3 | Admin + Manager cùng sửa | Admin save full doc + FE save status | FE retry thành công, admin changes preserved |
| 4 | Manager sửa item không có team mình | FE sửa item [BE only] | 403 Forbidden |
| 5 | Retry exhausted | 4+ saves đồng thời | 409 với message rõ ràng cho save cuối |

#### 7.3 UI Tests

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Gán 2 teams cho item | Hiện 2 status rows, 2 date rows |
| 2 | Manager FE xem item [FE, BE] | FE status editable, BE status read-only |
| 3 | Admin xem item [FE, BE] | Cả FE + BE đều editable |
| 4 | Timeline multi-team item | Hiện 2 arcs, đúng màu, đúng vị trí |
| 5 | Item cũ (team-node container) | Hiện single status/arc như cũ |
| 6 | Bỏ team khỏi item | teamStatuses[team] bị xóa, arc biến mất |
| 7 | Export Excel multi-team | Cột status hiện "FE: FE Done | BE: BE Start" |

#### 7.4 Edge Cases

- Item có `assignedTeams: ['FE']` nhưng `teamStatuses` rỗng → normalize tự tạo entry
- Item có `teamStatuses.FE` nhưng `assignedTeams` không có FE → normalize xóa orphan
- Item trong team-node container + cũng có `assignedTeams` → `assignedTeams` ưu tiên
- Parent item có children, mỗi child có teamStatuses → parent derive từ children (không phải teamStatuses của chính nó)
- Delete team khỏi item khi team đó có status = Done → confirm dialog cảnh báo

#### 7.5 Checklist Phase 7

- [ ] Unit tests cho tất cả helper functions
- [ ] Integration tests concurrent editing (mock 2-3 managers)
- [ ] UI tests cho multi-team display
- [ ] Edge case tests
- [ ] Performance test: roadmap với 200+ items, 50+ multi-team items

---

## Tổng Quan

| Phase | Nội Dung | Thời Gian | Dependencies |
|-------|---------|-----------|-------------|
| **Phase 1** | Data model: TeamStatusEntry, derive functions | 2-3 giờ | — |
| **Phase 2** | Permission: getItemTeams, validate, apply | 2-3 giờ | Phase 1 |
| **Phase 3** | Manager-save route retry + realtime sync | 2-3 giờ | Phase 2 |
| **Phase 4** | UI: gán team, multi-status, date editing | 3-4 giờ | Phase 1, 2 |
| **Phase 5** | Timeline: multi-team arcs | 2-3 giờ | Phase 1, 4 |
| **Phase 6** | Migration & backward compatibility | 1-2 giờ | Phase 1 |
| **Phase 7** | Testing & QA | 2-3 giờ | All phases |
| **Total** | | **14-21 giờ** | |

---

## Files Mới

| File | Mô tả |
|------|-------|
| `src/utils/teamStatusHelpers.ts` | `isMultiTeamItem()`, `deriveOverallStatus()`, `deriveOverallDates()`, `deriveOverallProgress()`, `normalizeTeamStatuses()`, `buildTeamStatuses()` |

## Files Sửa

| File | Thay đổi chính |
|------|---------------|
| `src/types/roadmap.ts` | Thêm `TeamStatusEntry`, `assignedTeams`, `teamStatuses` vào `RoadmapItem` |
| `src/types/auth.ts` | Thêm `team: TeamRole` vào `ManagerFieldChange` |
| `src/utils/permissions.ts` | Thêm `getItemTeams()`, cập nhật `getEditPermission()` |
| `src/utils/permissionCheck.ts` | Cập nhật `validateManagerChanges()`, `applyChangesToTree()` cho multi-team |
| `src/utils/roadmapHelpers.ts` | Cập nhật `recalculateItem()` xử lý multi-team |
| `src/utils/roadmapRows.ts` | Thêm `assignedTeams`, `teamStatuses` vào flatten/unflatten |
| `src/utils/exportToExcel.ts` | Multi-team status display trong export |
| `src/app/api/roadmap/[id]/manager-save/route.ts` | Retry mechanism (MAX_RETRY=3) |
| `src/app/roadmap/[id]/page.tsx` | Realtime version sync, team-aware save |
| `src/components/SpreadsheetGrid.tsx` | Multi-status UI, dynamic row height, multi-team arcs |
| `src/components/EditPopup.tsx` | "Assigned Teams" UI cho mọi item type |
| `src/components/TimelineArc.tsx` | Không đổi (đã đủ flexible) |

## Database Changes

**Không cần migration.** `assignedTeams` và `teamStatuses` nằm trong JSON document (`roadmap_data.content`), auto-persist khi save.

## Không Thay Đổi

- Schema DB (không thêm table/column)
- Auth flow (Google OAuth + team_members giữ nguyên)
- Admin full-save endpoint (admin gửi full document như cũ)
- Supabase RLS policies
