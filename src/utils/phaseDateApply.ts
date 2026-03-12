import { Milestone, RoadmapItem, normalizePhaseIds } from '../types/roadmap';

export interface PhaseDateAffectedGroup {
  id: string;
  name: string;
  path: string;
  nextStartDate: string;
  nextEndDate: string;
  matchedPhaseIds: string[];
}

export interface ApplyPhaseDatesResult {
  items: RoadmapItem[];
  affectedGroups: PhaseDateAffectedGroup[];
  updatedCount: number;
  skippedUnscheduledCount: number;
  skippedNoMatchCount: number;
}

type PhaseSchedule = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

type PathContext = {
  categoryName?: string;
  subcategoryName?: string;
};

function normalizeSchedule(raw: Milestone): PhaseSchedule | null {
  const id = (raw.id || '').trim();
  if (!id) return null;
  const startDate = (raw.startDate || '').trim();
  const endDate = (raw.endDate || '').trim();
  if (!startDate || !endDate) return null;
  if (startDate > endDate) return null;
  return {
    id,
    label: (raw.label || '').trim() || id,
    startDate,
    endDate,
  };
}

function buildScheduleMap(milestones: Milestone[]): Map<string, PhaseSchedule> {
  const map = new Map<string, PhaseSchedule>();
  milestones.forEach(milestone => {
    const schedule = normalizeSchedule(milestone);
    if (!schedule) return;
    map.set(schedule.id, schedule);
  });
  return map;
}

function formatItemPath(context: PathContext, itemName: string): string {
  const segments: string[] = [];
  if (context.categoryName) segments.push(context.categoryName);
  if (context.subcategoryName) segments.push(context.subcategoryName);
  segments.push(itemName);
  return segments.join(' > ');
}

function walkAndApplyByPhase(
  nodes: RoadmapItem[],
  context: PathContext,
  phaseId: string,
  targetSchedule: PhaseSchedule | null,
  affectedGroups: PhaseDateAffectedGroup[],
  counters: { updatedCount: number; skippedUnscheduledCount: number; skippedNoMatchCount: number }
): RoadmapItem[] {
  return nodes.map(node => {
    const nextContext: PathContext = { ...context };
    if (node.type === 'category') nextContext.categoryName = node.name;
    if (node.type === 'subcategory') nextContext.subcategoryName = node.name;

    let nextNode = node;

    if (node.type === 'group') {
      const phaseIds = normalizePhaseIds(node.phaseIds);
      if (!phaseIds.includes(phaseId)) {
        counters.skippedNoMatchCount += 1;
      } else if (!targetSchedule) {
        counters.skippedUnscheduledCount += 1;
      } else {
        const nextStartDate = targetSchedule.startDate;
        const nextEndDate = targetSchedule.endDate;
        if ((node.startDate || '') !== nextStartDate || (node.endDate || '') !== nextEndDate) {
          counters.updatedCount += 1;
          affectedGroups.push({
            id: node.id,
            name: node.name,
            path: formatItemPath(context, node.name),
            nextStartDate,
            nextEndDate,
            matchedPhaseIds: [phaseId],
          });
          nextNode = {
            ...node,
            startDate: nextStartDate,
            endDate: nextEndDate,
          };
        }
      }
    }

    if (node.children && node.children.length > 0) {
      const nextChildren = walkAndApplyByPhase(
        node.children,
        nextContext,
        phaseId,
        targetSchedule,
        affectedGroups,
        counters
      );
      if (nextChildren !== node.children) {
        nextNode = { ...nextNode, children: nextChildren };
      }
    }

    return nextNode;
  });
}

function walkAndApplyByAllPhases(
  nodes: RoadmapItem[],
  context: PathContext,
  scheduleMap: Map<string, PhaseSchedule>,
  affectedGroups: PhaseDateAffectedGroup[],
  counters: { updatedCount: number; skippedUnscheduledCount: number; skippedNoMatchCount: number }
): RoadmapItem[] {
  return nodes.map(node => {
    const nextContext: PathContext = { ...context };
    if (node.type === 'category') nextContext.categoryName = node.name;
    if (node.type === 'subcategory') nextContext.subcategoryName = node.name;

    let nextNode = node;

    if (node.type === 'group') {
      const phaseIds = normalizePhaseIds(node.phaseIds);
      if (phaseIds.length === 0) {
        counters.skippedNoMatchCount += 1;
      } else {
        const matchedSchedules = phaseIds
          .map(phaseId => scheduleMap.get(phaseId) || null)
          .filter((schedule): schedule is PhaseSchedule => !!schedule);

        if (matchedSchedules.length === 0) {
          counters.skippedUnscheduledCount += 1;
        } else {
          const nextStartDate = matchedSchedules.reduce(
            (min, schedule) => (schedule.startDate < min ? schedule.startDate : min),
            matchedSchedules[0].startDate
          );
          const nextEndDate = matchedSchedules.reduce(
            (max, schedule) => (schedule.endDate > max ? schedule.endDate : max),
            matchedSchedules[0].endDate
          );

          if ((node.startDate || '') !== nextStartDate || (node.endDate || '') !== nextEndDate) {
            counters.updatedCount += 1;
            affectedGroups.push({
              id: node.id,
              name: node.name,
              path: formatItemPath(context, node.name),
              nextStartDate,
              nextEndDate,
              matchedPhaseIds: matchedSchedules.map(schedule => schedule.id),
            });
            nextNode = {
              ...node,
              startDate: nextStartDate,
              endDate: nextEndDate,
            };
          }
        }
      }
    }

    if (node.children && node.children.length > 0) {
      const nextChildren = walkAndApplyByAllPhases(
        node.children,
        nextContext,
        scheduleMap,
        affectedGroups,
        counters
      );
      if (nextChildren !== node.children) {
        nextNode = { ...nextNode, children: nextChildren };
      }
    }

    return nextNode;
  });
}

export function applyDatesByPhase(
  items: RoadmapItem[],
  milestones: Milestone[],
  phaseId: string
): ApplyPhaseDatesResult {
  const targetSchedule = buildScheduleMap(milestones).get(phaseId) || null;
  const affectedGroups: PhaseDateAffectedGroup[] = [];
  const counters = { updatedCount: 0, skippedUnscheduledCount: 0, skippedNoMatchCount: 0 };

  const nextItems = walkAndApplyByPhase(
    items,
    {},
    phaseId,
    targetSchedule,
    affectedGroups,
    counters
  );

  return {
    items: nextItems,
    affectedGroups,
    updatedCount: counters.updatedCount,
    skippedUnscheduledCount: counters.skippedUnscheduledCount,
    skippedNoMatchCount: counters.skippedNoMatchCount,
  };
}

export function applyDatesByAllPhases(
  items: RoadmapItem[],
  milestones: Milestone[]
): ApplyPhaseDatesResult {
  const scheduleMap = buildScheduleMap(milestones);
  const affectedGroups: PhaseDateAffectedGroup[] = [];
  const counters = { updatedCount: 0, skippedUnscheduledCount: 0, skippedNoMatchCount: 0 };

  const nextItems = walkAndApplyByAllPhases(
    items,
    {},
    scheduleMap,
    affectedGroups,
    counters
  );

  return {
    items: nextItems,
    affectedGroups,
    updatedCount: counters.updatedCount,
    skippedUnscheduledCount: counters.skippedUnscheduledCount,
    skippedNoMatchCount: counters.skippedNoMatchCount,
  };
}
