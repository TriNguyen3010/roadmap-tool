import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoadmapItem } from '../types/roadmap';
import { convertGroupToSubcategoryWithWrap, createItemWithTimestamps, moveNodeToParent, normalizeItemTimestamps, recalculateRoadmap, touchItemTimestamp } from './roadmapHelpers';

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

describe('moveNodeToParent', () => {
  function makeTree(): RoadmapItem[] {
    return [
      {
        id: 'cat-app-core',
        name: 'App - Core',
        type: 'category',
        status: 'None',
        progress: 0,
        children: [
          {
            id: 'sub-wallet',
            name: 'Wallet',
            type: 'subcategory',
            status: 'None',
            progress: 0,
            children: [
              {
                id: 'group-send',
                name: 'Send',
                type: 'group',
                status: 'None',
                progress: 0,
                children: [
                  {
                    id: 'item-send-1',
                    name: 'Item A',
                    type: 'item',
                    status: 'None',
                    progress: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'cat-app-improvements',
        name: 'App - Improvements',
        type: 'category',
        status: 'None',
        progress: 0,
        children: [
          {
            id: 'sub-growth',
            name: 'Growth',
            type: 'subcategory',
            status: 'None',
            progress: 0,
            children: [],
          },
        ],
      },
    ];
  }

  it('moves a subcategory to another category', () => {
    const moved = moveNodeToParent(makeTree(), 'sub-wallet', 'cat-app-improvements');

    expect(findNode(moved, 'sub-wallet')?.name).toBe('Wallet');
    expect(findNode(moved, 'cat-app-core')?.children ?? []).toHaveLength(0);
    expect(findNode(moved, 'cat-app-improvements')?.children?.map(child => child.id)).toEqual(['sub-growth', 'sub-wallet']);
  });

  it('preserves subtree when moving a group to another subcategory', () => {
    const moved = moveNodeToParent(makeTree(), 'group-send', 'sub-growth');

    expect(findNode(moved, 'group-send')?.children?.[0].id).toBe('item-send-1');
    expect(findNode(moved, 'sub-wallet')?.children ?? []).toHaveLength(0);
    expect(findNode(moved, 'sub-growth')?.children?.map(child => child.id)).toEqual(['group-send']);
  });

  it('rejects invalid parent-child combinations', () => {
    const tree = makeTree();
    const moved = moveNodeToParent(tree, 'group-send', 'cat-app-improvements');

    expect(moved).toBe(tree);
  });

  it('rejects moving a node into its own descendant', () => {
    const tree = makeTree();
    const moved = moveNodeToParent(tree, 'sub-wallet', 'group-send');

    expect(moved).toBe(tree);
  });
});

function findNode(items: RoadmapItem[], id: string): RoadmapItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findNode(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

describe('convertGroupToSubcategoryWithWrap', () => {
  const fixedId = 'wrapper-uuid-1';
  const gen = () => fixedId;

  it('wraps existing children under a new group with the same name', () => {
    const source: RoadmapItem = makeItem({
      id: 'g-1',
      name: '[SwapX] Implement revenue settlement flow',
      type: 'group',
      groupItemType: 'Feature',
      children: [
        makeItem({ id: 't-ba', type: 'team', teamRole: 'BA', name: 'BA' }),
        makeItem({ id: 't-be', type: 'team', teamRole: 'BE', name: 'BE' }),
        makeItem({ id: 't-qc', type: 'team', teamRole: 'QC', name: 'QC' }),
      ],
    });

    const { subcategory, wrapperId } = convertGroupToSubcategoryWithWrap(source, gen);

    expect(wrapperId).toBe(fixedId);
    expect(subcategory.type).toBe('subcategory');
    expect(subcategory.subcategoryType).toBe('Feature');
    expect(subcategory.name).toBe(source.name);
    expect('groupItemType' in subcategory).toBe(false);

    expect(subcategory.children).toHaveLength(1);
    const wrapper = subcategory.children![0];
    expect(wrapper.id).toBe(fixedId);
    expect(wrapper.type).toBe('group');
    expect(wrapper.groupItemType).toBe('Feature');
    expect(wrapper.name).toBe(source.name);
    expect(wrapper.children!.map(c => c.id)).toEqual(['t-ba', 't-be', 't-qc']);
  });

  it('maps Improvement → Feature on the new subcategory (spec 4.2)', () => {
    const source: RoadmapItem = makeItem({
      id: 'g-imp',
      type: 'group',
      groupItemType: 'Improvement',
      children: [makeItem({ id: 'i-1', type: 'item' })],
    });

    const { subcategory } = convertGroupToSubcategoryWithWrap(source, gen);
    expect(subcategory.subcategoryType).toBe('Feature');
    // Wrapper still carries the original Improvement type
    expect(subcategory.children![0].groupItemType).toBe('Improvement');
  });

  it('returns wrapperId = null when source has no children (no wrapper needed)', () => {
    const source: RoadmapItem = makeItem({
      id: 'g-empty',
      type: 'group',
      groupItemType: 'Bug',
      children: [],
    });

    const { subcategory, wrapperId } = convertGroupToSubcategoryWithWrap(source, gen);
    expect(wrapperId).toBeNull();
    expect(subcategory.type).toBe('subcategory');
    expect(subcategory.subcategoryType).toBe('Bug');
    expect(subcategory.children).toEqual([]);
  });
});
