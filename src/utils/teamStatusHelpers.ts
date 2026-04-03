import {
  ItemStatus,
  RoadmapItem,
  TeamRole,
  TeamStatusEntry,
  normalizeItemStatus,
} from '../types/roadmap';

/**
 * Check if an item uses the multi-team model.
 */
export function isMultiTeamItem(item: RoadmapItem): boolean {
  return !!(item.assignedTeams && item.assignedTeams.length > 0 && item.teamStatuses);
}

const DONE_STATUSES: ItemStatus[] = [
  'QC Done - Pro',
  'QC Done - Staging',
  'Growth Done',
  'FE Done',
  'BE Done',
  'DevOps Done',
  'BA Done',
  'PD Done Visual',
  'PD Done UI/UX',
];

/**
 * Derive overall status from teamStatuses.
 * Uses same logic as deriveStatusFromChildren in roadmapHelpers.
 */
export function deriveOverallStatus(
  teamStatuses: Partial<Record<TeamRole, TeamStatusEntry>>
): ItemStatus {
  const statuses = Object.values(teamStatuses)
    .filter((ts): ts is TeamStatusEntry => !!ts)
    .map(ts => normalizeItemStatus(ts.status));

  if (statuses.length === 0) return 'None';

  const allNotStartedOrNone = statuses.every(s => s === 'Not Started' || s === 'None');
  const allDone = statuses.every(s => DONE_STATUSES.includes(s));
  const hasStatus = (target: ItemStatus): boolean => statuses.some(s => s === target);

  if (allDone) return 'QC Done - Pro';
  if (allNotStartedOrNone) {
    return statuses.every(s => s === 'None') ? 'None' : 'Not Started';
  }

  // Prefer concrete execution stage (highest priority → lowest)
  if (hasStatus('Growth in progress')) return 'Growth in progress';
  if (hasStatus('QC in progress')) return 'QC in progress';
  if (hasStatus('QC Done - Staging')) return 'QC Done - Staging';
  if (hasStatus('FE in progress')) return 'FE in progress';
  if (hasStatus('BE in progress')) return 'BE in progress';
  if (hasStatus('DevOps in progress')) return 'DevOps in progress';
  if (hasStatus('PD in progress Visual')) return 'PD in progress Visual';
  if (hasStatus('PD in progress UI/UX')) return 'PD in progress UI/UX';
  if (hasStatus('BA in progress')) return 'BA in progress';
  // Done-family statuses bubble up as partial progress
  if (hasStatus('Growth Done')) return 'Growth in progress';
  if (hasStatus('FE Done') || hasStatus('BE Done')) return 'QC Handle';
  if (hasStatus('DevOps Done')) return 'DevOps Done';
  if (hasStatus('PD Done Visual') || hasStatus('PD Done UI/UX')) return 'FE Handle';
  if (hasStatus('BA Done')) return 'PD Handle';
  // Handle-stage precedence
  if (hasStatus('Growth Handle')) return 'Growth Handle';
  if (hasStatus('QC Handle')) return 'QC Handle';
  if (hasStatus('FE Handle')) return 'FE Handle';
  if (hasStatus('BE Handle')) return 'BE Handle';
  if (hasStatus('DevOps Handle')) return 'DevOps Handle';
  if (hasStatus('PD Handle')) return 'PD Handle';
  if (hasStatus('BA Handle')) return 'BA Handle';
  if (DONE_STATUSES.some(ds => hasStatus(ds))) return 'FE in progress';
  return hasStatus('Not Started') ? 'Not Started' : 'None';
}

/**
 * Derive overall dates from teamStatuses.
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
 * Map status to a rough progress percentage.
 */
function statusToProgress(status: ItemStatus): number {
  if (status === 'QC Done - Pro') return 100;
  if (status === 'None' || status === 'Not Started') return 0;
  if (DONE_STATUSES.includes(status)) return 90;
  if (status.includes('in progress')) return 50;
  if (status.includes('Handle')) return 20;
  return 10;
}

/**
 * Derive overall progress from teamStatuses.
 */
export function deriveOverallProgress(
  teamStatuses: Partial<Record<TeamRole, TeamStatusEntry>>
): number {
  const entries = Object.values(teamStatuses).filter((ts): ts is TeamStatusEntry => !!ts);
  if (entries.length === 0) return 0;
  const progressPerTeam = entries.map(ts => statusToProgress(normalizeItemStatus(ts.status)));
  return Math.round(progressPerTeam.reduce((a, b) => a + b, 0) / entries.length);
}

/**
 * Normalize teamStatuses: ensure every assigned team has an entry,
 * remove orphan entries for teams not in assignedTeams.
 */
export function normalizeTeamStatuses(item: RoadmapItem): RoadmapItem {
  if (!item.assignedTeams || item.assignedTeams.length === 0) {
    // No assignedTeams → remove teamStatuses if present
    if (item.teamStatuses || item.assignedTeams) {
      const { teamStatuses, assignedTeams, ...rest } = item;
      void teamStatuses;
      void assignedTeams;
      return rest as RoadmapItem;
    }
    return item;
  }

  // Ensure each assigned team has an entry in teamStatuses
  const ts: Partial<Record<TeamRole, TeamStatusEntry>> = {};
  for (const team of item.assignedTeams) {
    ts[team] = item.teamStatuses?.[team] || { status: 'Not Started' };
  }

  return { ...item, teamStatuses: ts };
}

/**
 * Recursively normalize teamStatuses for an item tree.
 */
export function normalizeTeamStatusesTree(items: RoadmapItem[]): RoadmapItem[] {
  return items.map(item => {
    const normalized = normalizeTeamStatuses(item);
    if (normalized.children) {
      return { ...normalized, children: normalizeTeamStatusesTree(normalized.children) };
    }
    return normalized;
  });
}

/**
 * Build teamStatuses when assigning teams in EditPopup.
 * Keeps existing entries for teams that remain, creates new entries for newly added teams.
 */
export function buildTeamStatuses(
  existing: Partial<Record<TeamRole, TeamStatusEntry>> | undefined,
  teams: Set<TeamRole>
): Partial<Record<TeamRole, TeamStatusEntry>> {
  const result: Partial<Record<TeamRole, TeamStatusEntry>> = {};
  for (const team of teams) {
    result[team] = existing?.[team] || { status: 'Not Started' };
  }
  return result;
}
