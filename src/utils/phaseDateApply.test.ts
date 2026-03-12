import { describe, expect, it } from 'vitest';
import type { Milestone, RoadmapItem } from '../types/roadmap';
import { applyDatesByAllPhases, applyDatesByPhase } from './phaseDateApply';

function makeBaseItems(): RoadmapItem[] {
  return [
    {
      id: 'cat-wallet',
      name: 'Wallet',
      type: 'category',
      status: 'Not Started',
      progress: 0,
      children: [
        {
          id: 'sub-web',
          name: 'Web',
          type: 'subcategory',
          status: 'Not Started',
          progress: 0,
          children: [
            {
              id: 'group-a',
              name: 'Group A',
              type: 'group',
              status: 'Not Started',
              progress: 0,
              phaseIds: ['p1'],
            },
            {
              id: 'group-b',
              name: 'Group B',
              type: 'group',
              status: 'Not Started',
              progress: 0,
              phaseIds: ['p1', 'p2'],
            },
            {
              id: 'group-c',
              name: 'Group C',
              type: 'group',
              status: 'Not Started',
              progress: 0,
              phaseIds: ['p2'],
            },
            {
              id: 'group-d',
              name: 'Group D',
              type: 'group',
              status: 'Not Started',
              progress: 0,
            },
          ],
        },
      ],
    },
  ];
}

describe('phaseDateApply', () => {
  it('applyDatesByPhase updates only matched groups with scheduled phase', () => {
    const milestones: Milestone[] = [
      { id: 'p1', label: 'Phase 1', startDate: '2026-03-22', endDate: '2026-03-25', color: '#3b82f6' },
      { id: 'p2', label: 'Phase 2', startDate: '', endDate: '', color: '#22c55e' },
    ];

    const result = applyDatesByPhase(makeBaseItems(), milestones, 'p1');
    expect(result.updatedCount).toBe(2);
    expect(result.skippedUnscheduledCount).toBe(0);
    expect(result.affectedGroups.map(group => group.path)).toEqual([
      'Wallet > Web > Group A',
      'Wallet > Web > Group B',
    ]);
    expect(result.affectedGroups[0].nextStartDate).toBe('2026-03-22');
    expect(result.affectedGroups[0].nextEndDate).toBe('2026-03-25');
  });

  it('applyDatesByPhase skips groups when target phase is unscheduled', () => {
    const milestones: Milestone[] = [
      { id: 'p2', label: 'Phase 2', startDate: '', endDate: '', color: '#22c55e' },
    ];

    const result = applyDatesByPhase(makeBaseItems(), milestones, 'p2');
    expect(result.updatedCount).toBe(0);
    expect(result.affectedGroups).toHaveLength(0);
    expect(result.skippedUnscheduledCount).toBe(2);
  });

  it('applyDatesByAllPhases applies min-start and max-end for multi-phase groups', () => {
    const milestones: Milestone[] = [
      { id: 'p1', label: 'Phase 1', startDate: '2026-03-22', endDate: '2026-03-25', color: '#3b82f6' },
      { id: 'p2', label: 'Phase 2', startDate: '2026-04-01', endDate: '2026-04-10', color: '#22c55e' },
    ];

    const result = applyDatesByAllPhases(makeBaseItems(), milestones);
    expect(result.updatedCount).toBe(3);

    const groupA = result.affectedGroups.find(group => group.id === 'group-a');
    const groupB = result.affectedGroups.find(group => group.id === 'group-b');
    const groupC = result.affectedGroups.find(group => group.id === 'group-c');

    expect(groupA?.nextStartDate).toBe('2026-03-22');
    expect(groupA?.nextEndDate).toBe('2026-03-25');
    expect(groupB?.nextStartDate).toBe('2026-03-22');
    expect(groupB?.nextEndDate).toBe('2026-04-10');
    expect(groupC?.nextStartDate).toBe('2026-04-01');
    expect(groupC?.nextEndDate).toBe('2026-04-10');
  });

  it('applyDatesByAllPhases reports unscheduled groups when none of assigned phases has schedule', () => {
    const milestones: Milestone[] = [
      { id: 'p1', label: 'Phase 1', startDate: '', endDate: '', color: '#3b82f6' },
      { id: 'p2', label: 'Phase 2', startDate: '', endDate: '', color: '#22c55e' },
    ];

    const result = applyDatesByAllPhases(makeBaseItems(), milestones);
    expect(result.updatedCount).toBe(0);
    expect(result.affectedGroups).toHaveLength(0);
    expect(result.skippedUnscheduledCount).toBe(3);
    expect(result.skippedNoMatchCount).toBe(1);
  });
});
