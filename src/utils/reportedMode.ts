import {
  type PriorityFilterValue,
  normalizePriorityFilterValues,
} from '../types/roadmap';

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
