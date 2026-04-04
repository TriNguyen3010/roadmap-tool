import {
  type PriorityFilterValue,
  normalizePriorityFilterValues,
} from '../types/roadmap';

const REPORTED_SOURCE_OVERRIDES: Record<string, string> = {
  'a8335e0e-55ec-42c9-920f-d64c32825cc8': 'main',
};

export function ensureReportedPriority(priorities: string[]): PriorityFilterValue[] {
  if (priorities.includes('Reported')) {
    return normalizePriorityFilterValues(priorities);
  }
  return normalizePriorityFilterValues([...priorities, 'Reported']);
}

export function removeReportedPriority(priorities: string[]): PriorityFilterValue[] {
  return normalizePriorityFilterValues(priorities.filter(priority => priority !== 'Reported'));
}

export function toggleReportedMode(
  currentMode: boolean,
  priorities: string[]
): { nextMode: boolean; nextPriorities: PriorityFilterValue[] } {
  const nextMode = !currentMode;
  return {
    nextMode,
    nextPriorities: nextMode
      ? ensureReportedPriority(priorities)
      : removeReportedPriority(priorities),
  };
}

export function resolveReportedSourceRoadmapId(roadmapId: string): string {
  return REPORTED_SOURCE_OVERRIDES[roadmapId] || roadmapId;
}
