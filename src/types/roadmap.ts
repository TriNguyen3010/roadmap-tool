export type ItemType = 'category' | 'subcategory' | 'group' | 'team' | 'feature';
export type ItemStatus = 'Not Started' | 'In Progress' | 'Done';
export type StatusMode = 'auto' | 'manual';
export type ColumnWidthMode = 'auto' | 'manual';
export type ItemPriority = 'High' | 'Medium' | 'Low';
export type SubcategoryType = 'Feature' | 'Bug' | 'Growth Camp';
export type TeamRole = 'BA' | 'Growth' | 'PD' | 'BE' | 'FE';
export const TEAM_ROLES: TeamRole[] = ['BA', 'Growth', 'PD', 'BE', 'FE'];
export const PRIORITY_LEVELS: ItemPriority[] = ['High', 'Medium', 'Low'];


export interface RoadmapItem {
  id: string;
  name: string;
  type: ItemType;
  subcategoryType?: SubcategoryType; // only meaningful when type === 'subcategory'
  teamRole?: TeamRole; // only meaningful when type === 'team'
  // status shown in UI (effective value after auto/manual resolution)
  status: ItemStatus;
  // when mode is manual, manualStatus is the source value user sets
  statusMode?: StatusMode;
  manualStatus?: ItemStatus;
  progress: number;
  startDate?: string;
  endDate?: string;
  priority?: ItemPriority;
  quickNote?: string;
  children?: RoadmapItem[];
}

export interface Milestone {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  color: string; // hex color, e.g. '#ef4444'
}

export interface RoadmapDocument {
  releaseName: string;
  startDate: string;
  endDate: string;
  milestones?: Milestone[];
  settings?: {
    beforeWeeks: number;
    afterMonths: number;
    filterCategory?: string[];
    filterStatus?: string[];
    filterTeam?: string[];
    filterPriority?: string[];
    filterSubcategory?: string[];
    colPriority?: boolean;
    colPct?: boolean;
    colStartDate?: boolean;
    colEndDate?: boolean;
    colFeaturesWidth?: number;
    colFeaturesWidthMode?: ColumnWidthMode;
    expandedIds?: string[];
    hiddenRowIds?: string[];
  };
  items: RoadmapItem[];
}
