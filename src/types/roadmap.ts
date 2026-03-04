export type ItemType = 'category' | 'subcategory' | 'group' | 'team' | 'feature';
export type ItemStatus = 'Not Started' | 'In Progress' | 'Done';
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
  status: ItemStatus;
  progress: number;
  startDate?: string;
  endDate?: string;
  priority?: ItemPriority;
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
    filterStatus?: string[];
    filterTeam?: string[];
    filterPriority?: string[];
    colPriority?: boolean;
    colPct?: boolean;
    colStartDate?: boolean;
    colEndDate?: boolean;
  };
  items: RoadmapItem[];
}
