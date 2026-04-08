import {
    STATUS_OPTIONS,
    type ItemStatus,
    type RoadmapItem,
    type TeamRole as RoadmapTeamRole,
} from '@/types/roadmap';
import type {
    AuthManagerTeam,
    ItemId,
    ManagerFieldChange,
} from '@/types/auth';
import { touchItemTimestamp } from '@/utils/roadmapHelpers';
import { getItemTeam, getItemTeams, getItemType } from '@/utils/permissions';

const MANAGER_ALLOWED_FIELDS = new Set<ManagerFieldChange['field']>(['status', 'startDate', 'endDate', 'quickNote']);
const STATUS_SET = new Set<ItemStatus>(STATUS_OPTIONS);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUICK_NOTE_LENGTH = 500;

const normalizeNullableString = (value: string | null): string | undefined => {
    if (value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const isValidDateValue = (value: string | null): boolean => {
    if (value === null) return true;
    return ISO_DATE_RE.test(value);
};

export function getItemTeamFromTree(
    itemId: ItemId,
    items: RoadmapItem[],
    parentTeam?: RoadmapTeamRole
): RoadmapTeamRole | null {
    return getItemTeam(itemId, items, parentTeam);
}

export function validateManagerChanges(
    managerTeam: AuthManagerTeam,
    changes: ManagerFieldChange[],
    items: RoadmapItem[]
): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const change of changes) {
        if (!MANAGER_ALLOWED_FIELDS.has(change.field)) {
            violations.push(`Field "${change.field}" không được phép sửa`);
            continue;
        }

        if (change.field === 'status' && !STATUS_SET.has(change.value)) {
            violations.push(`Status "${change.value}" không hợp lệ`);
            continue;
        }

        if ((change.field === 'startDate' || change.field === 'endDate') && !isValidDateValue(change.value)) {
            violations.push(`Date value của field "${change.field}" không hợp lệ`);
            continue;
        }

        if (change.field === 'quickNote' && change.value !== null && change.value.trim().length > MAX_QUICK_NOTE_LENGTH) {
            violations.push(`quickNote vượt quá ${MAX_QUICK_NOTE_LENGTH} ký tự`);
            continue;
        }

        // Category items are never editable by managers
        const itemType = getItemType(change.itemId, items);
        if (itemType === 'category') {
            violations.push(`Item ${change.itemId} là category, manager không được sửa`);
            continue;
        }

        // Validate team ownership for all editable fields
        if (['status', 'startDate', 'endDate', 'quickNote'].includes(change.field)) {
            if (change.team && change.team !== managerTeam) {
                violations.push(`Manager ${managerTeam} không thể sửa team ${change.team}`);
                continue;
            }
            const itemTeams = getItemTeams(change.itemId, items);
            const targetTeam = change.team || managerTeam;
            if (!itemTeams.includes(targetTeam)) {
                violations.push(
                    `${change.field}: Item ${change.itemId} thuộc teams [${itemTeams.join(', ')}], không bao gồm ${targetTeam}`
                );
            }
        }
    }

    return { valid: violations.length === 0, violations };
}

export function applyChangesToTree(
    items: RoadmapItem[],
    changes: ManagerFieldChange[]
): RoadmapItem[] {
    const changeMap = new Map<ItemId, ManagerFieldChange[]>();
    for (const change of changes) {
        const existing = changeMap.get(change.itemId) || [];
        existing.push(change);
        changeMap.set(change.itemId, existing);
    }

    const applyToItems = (nodes: RoadmapItem[]): RoadmapItem[] => {
        return nodes.map((item) => {
            const itemChanges = changeMap.get(item.id);
            let updated = item;

            if (itemChanges) {
                updated = { ...item };

                for (const change of itemChanges) {
                    if (change.field === 'status') {
                        updated = {
                            ...updated,
                            statusMode: 'manual',
                            manualStatus: change.value,
                            status: change.value,
                        };
                        continue;
                    }

                    if (change.field === 'quickNote') {
                        updated = {
                            ...updated,
                            quickNote: normalizeNullableString(change.value),
                        };
                        continue;
                    }

                    if (change.field === 'startDate' || change.field === 'endDate') {
                        updated = {
                            ...updated,
                            [change.field]: normalizeNullableString(change.value),
                        };
                    }
                }

                updated = touchItemTimestamp(updated);
            }

            if (updated.children?.length) {
                updated = { ...updated, children: applyToItems(updated.children) };
            }

            return updated;
        });
    };

    return applyToItems(items);
}
