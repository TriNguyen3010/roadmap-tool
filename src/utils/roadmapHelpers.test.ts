import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoadmapItem } from '../types/roadmap';
import { createItemWithTimestamps, normalizeItemTimestamps, recalculateRoadmap, touchItemTimestamp } from './roadmapHelpers';

function makeItem(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: 'item-1',
    name: 'Task',
    type: 'item',
    status: 'None',
    statusMode: 'manual',
    manualStatus: 'None',
    progress: 0,
    ...overrides,
  };
}

describe('roadmapHelpers timestamp utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizeItemTimestamps backfills legacy items recursively', () => {
    const normalized = normalizeItemTimestamps(makeItem({
      children: [
        makeItem({
          id: 'team-1',
          type: 'team',
          name: 'FE',
        }),
      ],
    }));

    expect(normalized.created_at).toBe('2026-04-02T10:00:00.000Z');
    expect(normalized.updated_at).toBe('2026-04-02T10:00:00.000Z');
    expect(normalized.children?.[0].created_at).toBe('2026-04-02T10:00:00.000Z');
    expect(normalized.children?.[0].updated_at).toBe('2026-04-02T10:00:00.000Z');
  });

  it('normalizeItemTimestamps preserves existing values and mirrors the known side when one side is missing', () => {
    const withCreatedOnly = normalizeItemTimestamps(makeItem({
      created_at: '2026-03-30T08:00:00.000Z',
    }));
    const withUpdatedOnly = normalizeItemTimestamps(makeItem({
      updated_at: '2026-03-31T09:15:00.000Z',
    }));

    expect(withCreatedOnly.created_at).toBe('2026-03-30T08:00:00.000Z');
    expect(withCreatedOnly.updated_at).toBe('2026-03-30T08:00:00.000Z');
    expect(withUpdatedOnly.created_at).toBe('2026-03-31T09:15:00.000Z');
    expect(withUpdatedOnly.updated_at).toBe('2026-03-31T09:15:00.000Z');
  });

  it('touchItemTimestamp keeps created_at and bumps updated_at', () => {
    const updated = touchItemTimestamp(makeItem({
      created_at: '2026-03-30T08:00:00.000Z',
      updated_at: '2026-03-30T08:00:00.000Z',
    }));

    expect(updated.created_at).toBe('2026-03-30T08:00:00.000Z');
    expect(updated.updated_at).toBe('2026-04-02T10:00:00.000Z');
  });

  it('createItemWithTimestamps sets defaults for new manual items', () => {
    const created = createItemWithTimestamps({
      id: 'new-item',
      name: 'Bridge',
      type: 'item',
    });

    expect(created.status).toBe('None');
    expect(created.statusMode).toBe('manual');
    expect(created.manualStatus).toBe('None');
    expect(created.created_at).toBe('2026-04-02T10:00:00.000Z');
    expect(created.updated_at).toBe('2026-04-02T10:00:00.000Z');
  });

  it('createItemWithTimestamps defaults parent items with children to auto mode', () => {
    const created = createItemWithTimestamps({
      id: 'category-1',
      name: 'Wallet',
      type: 'category',
      children: [],
    });
    const createdWithChild = createItemWithTimestamps({
      id: 'group-1',
      name: 'Swap',
      type: 'group',
      children: [makeItem({ id: 'team-fe', type: 'team', name: 'FE' })],
    });

    expect(created.statusMode).toBe('manual');
    expect(created.manualStatus).toBe('None');
    expect(createdWithChild.statusMode).toBe('auto');
    expect(createdWithChild.manualStatus).toBeUndefined();
  });
});

describe('recalculateRoadmap legacy cleanup', () => {
  it('strips deprecated assigned-team fields from legacy items', () => {
    const legacyItem = {
      ...makeItem(),
      assignedTeams: ['FE', 'BE'],
      teamStatuses: {
        FE: { status: 'FE in progress' },
        BE: { status: 'BE in progress' },
      },
    } as RoadmapItem & {
      assignedTeams?: string[];
      teamStatuses?: Record<string, { status: string }>;
    };

    const items = recalculateRoadmap([legacyItem as RoadmapItem]);

    expect(items[0]).not.toHaveProperty('assignedTeams');
    expect(items[0]).not.toHaveProperty('teamStatuses');
    expect(items[0].statusMode).toBe('manual');
    expect(items[0].status).toBe('None');
  });
});
