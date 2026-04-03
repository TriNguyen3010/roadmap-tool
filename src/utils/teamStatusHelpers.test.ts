import { describe, expect, it } from 'vitest';
import {
  isMultiTeamItem,
  deriveOverallStatus,
  deriveOverallDates,
  deriveOverallProgress,
  normalizeTeamStatuses,
  buildTeamStatuses,
  normalizeTeamStatusesTree,
} from './teamStatusHelpers';
import type { RoadmapItem } from '../types/roadmap';

const makeItem = (overrides: Partial<RoadmapItem> = {}): RoadmapItem => ({
  id: 'test-1',
  name: 'Test Item',
  type: 'item',
  status: 'None',
  progress: 0,
  ...overrides,
});

describe('isMultiTeamItem', () => {
  it('returns true when assignedTeams + teamStatuses present', () => {
    const item = makeItem({
      assignedTeams: ['FE', 'BE'],
      teamStatuses: {
        FE: { status: 'FE in progress' },
        BE: { status: 'BE in progress' },
      },
    });
    expect(isMultiTeamItem(item)).toBe(true);
  });

  it('returns false when assignedTeams missing', () => {
    expect(isMultiTeamItem(makeItem())).toBe(false);
  });

  it('returns false when assignedTeams empty', () => {
    expect(isMultiTeamItem(makeItem({ assignedTeams: [] }))).toBe(false);
  });

  it('returns false when teamStatuses missing', () => {
    expect(isMultiTeamItem(makeItem({ assignedTeams: ['FE'] }))).toBe(false);
  });
});

describe('deriveOverallStatus', () => {
  it('returns None for empty teamStatuses', () => {
    expect(deriveOverallStatus({})).toBe('None');
  });

  it('returns QC Done - Pro when all teams done', () => {
    expect(deriveOverallStatus({
      FE: { status: 'FE Done' },
      BE: { status: 'BE Done' },
    })).toBe('QC Done - Pro');
  });

  it('returns Not Started when all not started', () => {
    expect(deriveOverallStatus({
      FE: { status: 'Not Started' },
      BE: { status: 'Not Started' },
    })).toBe('Not Started');
  });

  it('returns highest priority in-progress status', () => {
    // BE in progress is checked before FE Done/BE Done combo → returns BE in progress
    expect(deriveOverallStatus({
      FE: { status: 'FE Done' },
      BE: { status: 'BE in progress' },
    })).toBe('BE in progress');
  });

  it('handles mixed FE in progress + BE not started', () => {
    expect(deriveOverallStatus({
      FE: { status: 'FE in progress' },
      BE: { status: 'Not Started' },
    })).toBe('FE in progress');
  });
});

describe('deriveOverallDates', () => {
  it('returns earliest start and latest end', () => {
    const result = deriveOverallDates({
      FE: { status: 'FE in progress', startDate: '2026-04-01', endDate: '2026-04-05' },
      BE: { status: 'BE in progress', startDate: '2026-04-03', endDate: '2026-04-08' },
    });
    expect(result.startDate).toBe('2026-04-01');
    expect(result.endDate).toBe('2026-04-08');
  });

  it('returns undefined when no dates', () => {
    const result = deriveOverallDates({
      FE: { status: 'FE in progress' },
    });
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });
});

describe('deriveOverallProgress', () => {
  it('returns 0 for empty', () => {
    expect(deriveOverallProgress({})).toBe(0);
  });

  it('returns average progress from statuses', () => {
    const progress = deriveOverallProgress({
      FE: { status: 'FE Done' },     // ~90
      BE: { status: 'Not Started' }, // 0
    });
    expect(progress).toBe(45);
  });

  it('returns 100 when all QC Done - Pro', () => {
    const progress = deriveOverallProgress({
      FE: { status: 'QC Done - Pro' },
      BE: { status: 'QC Done - Pro' },
    });
    expect(progress).toBe(100);
  });
});

describe('normalizeTeamStatuses', () => {
  it('removes teamStatuses when no assignedTeams', () => {
    const item = makeItem({
      teamStatuses: { FE: { status: 'FE in progress' } },
    });
    const result = normalizeTeamStatuses(item);
    expect(result.teamStatuses).toBeUndefined();
    expect(result.assignedTeams).toBeUndefined();
  });

  it('creates missing team entries', () => {
    const item = makeItem({
      assignedTeams: ['FE', 'BE'],
      teamStatuses: { FE: { status: 'FE in progress' } },
    });
    const result = normalizeTeamStatuses(item);
    expect(result.teamStatuses?.FE?.status).toBe('FE in progress');
    expect(result.teamStatuses?.BE?.status).toBe('Not Started');
  });

  it('removes orphan team entries', () => {
    const item = makeItem({
      assignedTeams: ['FE'],
      teamStatuses: {
        FE: { status: 'FE in progress' },
        BE: { status: 'BE in progress' },
      },
    });
    const result = normalizeTeamStatuses(item);
    expect(result.teamStatuses?.FE).toBeDefined();
    expect(result.teamStatuses?.BE).toBeUndefined();
  });
});

describe('buildTeamStatuses', () => {
  it('creates entries for new teams', () => {
    const result = buildTeamStatuses(undefined, new Set(['FE', 'BE']));
    expect(result.FE?.status).toBe('Not Started');
    expect(result.BE?.status).toBe('Not Started');
  });

  it('preserves existing entries', () => {
    const existing = { FE: { status: 'FE Done' as const } };
    const result = buildTeamStatuses(existing, new Set(['FE', 'BE']));
    expect(result.FE?.status).toBe('FE Done');
    expect(result.BE?.status).toBe('Not Started');
  });
});

describe('normalizeTeamStatusesTree', () => {
  it('recursively normalizes children', () => {
    const items: RoadmapItem[] = [
      makeItem({
        id: 'parent',
        assignedTeams: ['FE'],
        teamStatuses: {},
        children: [
          makeItem({
            id: 'child',
            assignedTeams: ['BE'],
            teamStatuses: {},
          }),
        ],
      }),
    ];
    const result = normalizeTeamStatusesTree(items);
    expect(result[0].teamStatuses?.FE?.status).toBe('Not Started');
    expect(result[0].children?.[0].teamStatuses?.BE?.status).toBe('Not Started');
  });
});
