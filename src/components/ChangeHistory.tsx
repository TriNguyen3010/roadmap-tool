'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

// ── Types ───────────────────────────────────────────────────────────────────

interface ChangeRecord {
    id: string;
    team: string | null;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedAt: string;
}

interface ChangeHistoryProps {
    itemId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
    status: 'Status',
    startDate: 'Start Date',
    endDate: 'End Date',
    quickNote: 'Quick Note',
};

function fieldLabel(field: string): string {
    return FIELD_LABELS[field] ?? field;
}

function displayValue(value: string | null): string {
    return value || '—';
}

function relativeTime(iso: string): string {
    try {
        return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    } catch {
        return iso;
    }
}

function shortEmail(email: string): string {
    // Show part before @ to save space
    const idx = email.indexOf('@');
    return idx > 0 ? email.slice(0, idx) : email;
}

// ── Team color mapping ──────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, { bg: string; text: string }> = {
    BA: { bg: '#fef3c7', text: '#92400e' },
    PD: { bg: '#fce7f3', text: '#9d174d' },
    FE: { bg: '#ede9fe', text: '#7c3aed' },
    BE: { bg: '#dbeafe', text: '#2563eb' },
    DevOps: { bg: '#fee2e2', text: '#dc2626' },
    QC: { bg: '#dcfce7', text: '#15803d' },
    Growth: { bg: '#ffedd5', text: '#ea580c' },
};

function teamStyle(team: string | null): { bg: string; text: string } {
    if (!team) return { bg: '#f1f5f9', text: '#475569' };
    return TEAM_COLORS[team] ?? { bg: '#f1f5f9', text: '#475569' };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ChangeHistory({ itemId }: ChangeHistoryProps) {
    const params = useParams<{ id: string }>();
    const roadmapId = params?.id;

    const [latestChanges, setLatestChanges] = useState<ChangeRecord[]>([]);
    const [fullHistory, setFullHistory] = useState<ChangeRecord[]>([]);
    const [fullTotal, setFullTotal] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoadingLatest, setIsLoadingLatest] = useState(false);
    const [isLoadingFull, setIsLoadingFull] = useState(false);
    const [fullOffset, setFullOffset] = useState(0);

    const PAGE_SIZE = 20;

    // Load latest changes on mount
    useEffect(() => {
        if (!roadmapId || !itemId) return;
        setIsLoadingLatest(true);
        setLatestChanges([]);
        setFullHistory([]);
        setFullTotal(0);
        setIsExpanded(false);
        setFullOffset(0);

        fetch(`/api/roadmap/${roadmapId}/items/${itemId}/changes?mode=latest`)
            .then(res => res.ok ? res.json() : { changes: [] })
            .then(data => setLatestChanges(data.changes ?? []))
            .catch(() => setLatestChanges([]))
            .finally(() => setIsLoadingLatest(false));
    }, [roadmapId, itemId]);

    // Load full history
    const loadFullHistory = useCallback(async (offset: number, append: boolean) => {
        if (!roadmapId || !itemId) return;
        setIsLoadingFull(true);
        try {
            const res = await fetch(
                `/api/roadmap/${roadmapId}/items/${itemId}/changes?mode=full&limit=${PAGE_SIZE}&offset=${offset}`
            );
            if (!res.ok) return;
            const data = await res.json();
            const newChanges = data.changes ?? [];
            setFullHistory(prev => append ? [...prev, ...newChanges] : newChanges);
            setFullTotal(data.total ?? 0);
            setFullOffset(offset + newChanges.length);
        } catch { /* ignore */ }
        finally { setIsLoadingFull(false); }
    }, [roadmapId, itemId]);

    const handleToggleExpand = () => {
        if (!isExpanded && fullHistory.length === 0) {
            loadFullHistory(0, false);
        }
        setIsExpanded(prev => !prev);
    };

    const handleLoadMore = () => {
        loadFullHistory(fullOffset, true);
    };

    // ── Group latest changes by team ────────────────────────────────────────

    const teamGroups = groupByTeam(latestChanges);

    if (isLoadingLatest) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Change History</p>
                <p className="mt-1 text-[11px] text-slate-400">Loading...</p>
            </div>
        );
    }

    if (latestChanges.length === 0 && !isExpanded) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Change History</p>
                <p className="mt-1 text-[11px] text-slate-400">No changes recorded.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Change History</p>

            {/* Default compact view: latest per team×field */}
            {!isExpanded && (
                <div className="mt-2 flex flex-col gap-2">
                    {teamGroups.map(({ team, changes }) => (
                        <div key={team ?? '__none'}>
                            <TeamBadge team={team} />
                            <div className="mt-1 flex flex-col gap-0.5">
                                {changes.map(c => (
                                    <ChangeRow key={c.id} change={c} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Full history view */}
            {isExpanded && (
                <div className="mt-2 flex flex-col gap-0.5">
                    {fullHistory.map(c => (
                        <FullChangeRow key={c.id} change={c} />
                    ))}
                    {isLoadingFull && (
                        <p className="text-[11px] text-slate-400 py-1">Loading...</p>
                    )}
                    {!isLoadingFull && fullOffset < fullTotal && (
                        <button
                            type="button"
                            onClick={handleLoadMore}
                            className="mt-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 text-left"
                        >
                            Load more ({fullTotal - fullOffset} remaining)
                        </button>
                    )}
                    {!isLoadingFull && fullHistory.length === 0 && (
                        <p className="text-[11px] text-slate-400">No changes recorded.</p>
                    )}
                </div>
            )}

            {/* Toggle button */}
            <button
                type="button"
                onClick={handleToggleExpand}
                className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
            >
                <History size={12} />
                {isExpanded ? 'Show compact view' : 'Show full history'}
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TeamBadge({ team }: { team: string | null }) {
    const style = teamStyle(team);
    return (
        <span
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: style.bg, color: style.text }}
        >
            {team ?? 'General'}
        </span>
    );
}

function ChangeRow({ change }: { change: ChangeRecord }) {
    return (
        <div className="flex items-baseline gap-1.5 text-[11px] leading-[18px]">
            <span className="font-semibold text-slate-600 shrink-0">{fieldLabel(change.field)}:</span>
            <span className="text-slate-500">{displayValue(change.oldValue)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium text-slate-700">{displayValue(change.newValue)}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-400" title={change.changedAt}>
                {relativeTime(change.changedAt)} · {shortEmail(change.changedBy)}
            </span>
        </div>
    );
}

function FullChangeRow({ change }: { change: ChangeRecord }) {
    const style = teamStyle(change.team);
    return (
        <div className="flex items-baseline gap-1.5 text-[11px] leading-[18px]">
            <span
                className="inline-block shrink-0 rounded px-1 py-0 text-[9px] font-bold uppercase"
                style={{ backgroundColor: style.bg, color: style.text }}
            >
                {change.team ?? '—'}
            </span>
            <span className="font-semibold text-slate-600 shrink-0">{fieldLabel(change.field)}:</span>
            <span className="text-slate-500">{displayValue(change.oldValue)}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium text-slate-700">{displayValue(change.newValue)}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-400" title={change.changedAt}>
                {relativeTime(change.changedAt)} · {shortEmail(change.changedBy)}
            </span>
        </div>
    );
}

// ── Grouping utility ────────────────────────────────────────────────────────

interface TeamGroup {
    team: string | null;
    changes: ChangeRecord[];
}

function groupByTeam(changes: ChangeRecord[]): TeamGroup[] {
    const map = new Map<string, ChangeRecord[]>();
    for (const c of changes) {
        const key = c.team ?? '__none';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
    }
    return Array.from(map.entries()).map(([key, changes]) => ({
        team: key === '__none' ? null : key,
        changes,
    }));
}
