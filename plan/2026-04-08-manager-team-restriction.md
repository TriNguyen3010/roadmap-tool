# Plan: Manager chỉ được điều chỉnh row của team mình

## Mục tiêu

- Manager thuộc team FE → chỉ được sửa status, date của row FE
- Click vào row team khác → hiện tooltip "Bạn chỉ có thể chỉnh sửa team [tên team]"
- Server API cũng validate team ownership

## Hiện trạng

### UI — `getEditPermission()` (`src/utils/permissions.ts` line 86-103)

```tsx
if (user.role === 'manager' && user.team) {
    const isOwnTeam = itemTeams.includes(user.team);
    return {
        canEditStatus: true,      // ← cho sửa TẤT CẢ team
        canEditDates: true,       // ← cho sửa TẤT CẢ team  
        canEditNotes: isOwnTeam,  // ← chỉ team mình ✅
    };
}
```

**Vấn đề:** `canEditStatus` và `canEditDates` luôn `true` cho mọi item (trừ category), không check `isOwnTeam`.

### API — `/api/roadmap/[id]/manager-save/route.ts`

- `quickNote`: **có validate** team ownership → reject nếu khác team
- `status`, `startDate`, `endDate`: **không validate** team → cho sửa tất cả

---

## Thay đổi

### 1. UI — `src/utils/permissions.ts`

Sửa `getEditPermission()` để status và dates cũng check `isOwnTeam`:

```diff
  if (user.role === 'manager' && user.team) {
      const itemType = getItemType(itemId, items);
      if (itemType === 'category') return NONE_PERMISSION;

      const itemTeams = getItemTeams(itemId, items);
      const isOwnTeam = itemTeams.includes(user.team as RoadmapTeamRole);

      return {
-         canEditStatus: true,
-         canEditDates: true,
+         canEditStatus: isOwnTeam,
+         canEditDates: isOwnTeam,
          canEditNotes: isOwnTeam,
          canEditStructure: false,
          canEditMilestones: false,
          canManageRoadmap: false,
      };
  }
```

**Hiệu ứng:** Khi `isOwnTeam = false`:
- Status cell: không clickable (đã có logic `canClickStatus && rowPermission.canEditStatus`)
- Date cell: không clickable (đã có logic `isDateCellEditable`)
- Quick note: không editable (đã có logic check)

### 2. Tooltip thông báo — `src/components/SpreadsheetGrid.tsx`

Thêm tooltip cho các cell bị restrict. Cần truyền thêm `currentUser.team` để hiện tên team.

#### 2a. Status cell (khoảng line 2243-2256)

Hiện tại khi `canClickStatus = false`, cell không có tooltip hữu ích. Thêm:

```tsx
title={!canClickStatus && currentUser?.team
    ? `Bạn chỉ có thể chỉnh sửa team ${currentUser.team}`
    : ...existing logic...
}
```

#### 2b. Date cells (khoảng line 2320-2349)

Tương tự cho Start Date và End Date cells:

```tsx
title={!isDateCellEditable && currentUser?.team && !canEditStructure
    ? `Bạn chỉ có thể chỉnh sửa team ${currentUser.team}`
    : ...existing logic...
}
```

#### 2c. Xác định row có phải team khác

Cần helper để biết khi nào hiện tooltip "team khác" vs "không có quyền":

```tsx
const isOtherTeamRow = currentUser?.role === 'manager' 
    && currentUser?.team 
    && !isAdminLevel(currentUser)
    && row.type === 'team' 
    && row.teamRole 
    && row.teamRole !== currentUser.team;
```

### 3. API validation — `src/app/api/roadmap/[id]/manager-save/route.ts`

Mở rộng team check cho status và dates (hiện chỉ check quickNote):

```diff
- if (change.field === 'quickNote') {
+ if (['status', 'startDate', 'endDate', 'quickNote'].includes(change.field)) {
      const itemTeam = resolveItemTeam(chain);
      if (itemTeam !== managerTeam) {
-         violations.push(`Item does not belong to team ${managerTeam}`);
+         violations.push(`${change.field}: item does not belong to team ${managerTeam}`);
      }
  }
```

---

## Tổng kết thay đổi

| File | Thay đổi |
|---|---|
| `src/utils/permissions.ts` | `canEditStatus` và `canEditDates` → `isOwnTeam` |
| `src/components/SpreadsheetGrid.tsx` | Tooltip "Bạn chỉ có thể chỉnh sửa team X" cho status/date cells |
| `src/app/api/roadmap/[id]/manager-save/route.ts` | Validate team ownership cho status/dates (không chỉ quickNote) |

## Lưu ý

- **Admin** không bị ảnh hưởng — `isAdminLevel()` return full permissions
- **Group/Subcategory rows**: manager vẫn không sửa được vì `getItemTeams()` trả team từ ancestor chain — group không thuộc team cụ thể nào
- **Team row không phải của mình**: tooltip rõ ràng + cell disabled
- Cả UI và API đều validate → double protection
