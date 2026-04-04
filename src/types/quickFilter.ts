/** Which quick filter mode is currently active (only one at a time) */
export type QuickFilterMode = 'status' | 'team' | 'priority' | null;

/** State for the Status quick filter */
export interface QuickFilterStatusState {
    /** Selected status values (OR within group) */
    statuses: string[];
}

/** State for the Team quick filter (team + status sub-filter) */
export interface QuickFilterTeamState {
    /** Selected team roles */
    teams: string[];
    /** Status sub-filter applied to all selected teams */
    statuses: string[];
}

/** State for the Priority quick filter (priority + team sub-filter) */
export interface QuickFilterPriorityState {
    /** Selected priority levels */
    priorities: string[];
    /** Team sub-filter (default: all teams selected) */
    teams: string[];
}

/** Combined quick filter state passed from page to toolbar */
export interface QuickFilterState {
    activeMode: QuickFilterMode;
    status: QuickFilterStatusState;
    team: QuickFilterTeamState;
    priority: QuickFilterPriorityState;
}

/** Default initial state */
export const EMPTY_QUICK_FILTER_STATUS: QuickFilterStatusState = { statuses: [] };
export const EMPTY_QUICK_FILTER_TEAM: QuickFilterTeamState = { teams: [], statuses: [] };
export const EMPTY_QUICK_FILTER_PRIORITY: QuickFilterPriorityState = { priorities: [], teams: [] };

export const EMPTY_QUICK_FILTER: QuickFilterState = {
    activeMode: null,
    status: EMPTY_QUICK_FILTER_STATUS,
    team: EMPTY_QUICK_FILTER_TEAM,
    priority: EMPTY_QUICK_FILTER_PRIORITY,
};
