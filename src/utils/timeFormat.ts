import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const FALLBACK_LABEL = 'Không có dữ liệu';

function parseTimestamp(value: string | undefined): Date | null {
    const normalized = value?.trim();
    if (!normalized) return null;
    const parsed = parseISO(normalized);
    return isValid(parsed) ? parsed : null;
}

export function formatRelativeTime(value: string | undefined): string {
    const parsed = parseTimestamp(value);
    if (!parsed) return FALLBACK_LABEL;
    return formatDistanceToNow(parsed, { addSuffix: true, locale: vi });
}

export function formatFullDateTime(value: string | undefined): string {
    const parsed = parseTimestamp(value);
    if (!parsed) return FALLBACK_LABEL;
    return format(parsed, 'dd/MM/yyyy HH:mm:ss', { locale: vi });
}

export function wasUpdated(createdAt: string | undefined, updatedAt: string | undefined): boolean {
    const created = parseTimestamp(createdAt);
    const updated = parseTimestamp(updatedAt);
    if (!created || !updated) return false;
    return created.getTime() !== updated.getTime();
}
