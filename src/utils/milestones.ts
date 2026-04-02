import { type Milestone, normalizeWeekColor, normalizeWeekLabel } from '@/types/roadmap';

export function normalizeMilestoneDateValue(value: string | undefined | null): string {
    return (value || '').trim();
}

export function normalizeMilestonesForSave(milestones: Milestone[] | undefined): Milestone[] | undefined {
    if (!milestones) return milestones;

    return milestones.map((milestone, index) => {
        const id = (milestone.id || '').trim() || `phase_${index + 1}`;
        const label = normalizeWeekLabel(milestone.label, index);
        const color = normalizeWeekColor(milestone.color, index);
        let startDate = normalizeMilestoneDateValue(milestone.startDate);
        let endDate = normalizeMilestoneDateValue(milestone.endDate);

        if (startDate && !endDate) {
            endDate = startDate;
        } else if (!startDate && endDate) {
            startDate = endDate;
        }

        return {
            ...milestone,
            id,
            label,
            color,
            startDate,
            endDate,
        };
    });
}

export function validateNormalizedMilestones(
    milestones: Milestone[] | undefined
): { ok: true; milestones: Milestone[] } | { ok: false; error: string } {
    const normalized = normalizeMilestonesForSave(milestones) || [];

    for (const milestone of normalized) {
        if (milestone.startDate && milestone.endDate && milestone.startDate > milestone.endDate) {
            return {
                ok: false,
                error: `Week "${milestone.label}" có ngày bắt đầu lớn hơn ngày kết thúc.`,
            };
        }
    }

    return {
        ok: true,
        milestones: normalized,
    };
}
