export type ItemType = 'category' | 'subcategory' | 'group' | 'feature';
export type ItemStatus = 'Not Started' | 'In Progress' | 'Done';
export type SubcategoryType = 'Feature' | 'Bug' | 'Growth Camp';

export interface RoadmapItem {
  id: string;
  name: string;
  type: ItemType;
  subcategoryType?: SubcategoryType; // only meaningful when type === 'subcategory'
  status: ItemStatus;
  progress: number;
  startDate?: string;
  endDate?: string;
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
  };
  items: RoadmapItem[];
}
