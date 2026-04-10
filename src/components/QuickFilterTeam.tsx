'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { DEFAULT_ROADMAP_CONFIG, type RoadmapConfig } from '@/types/roadmap';
import type { QuickFilterTeamState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#F0B90B';

// Preset: defines a matcher to narrow statuses
type PresetKey = 'doing' | 'todo' | 'done';
const PRESETS: { key: PresetKey; label: string; match: (s: string) => boolean }[] = [
    {
        key: 'doing',
        label: 'In Progress',
        match: (s: string) => s.includes('in progress'),
    },
    {
        key: 'todo',
        label: 'To do',
        match: (s: string) => s.includes('Handle'),
    },
    {
        key: 'done',
        label: 'Done',
        match: (s: string) => s.includes('Done'),
    },
];

// Get all statuses for given teams from config
function getStatusesForTeams(teams: string[], config: RoadmapConfig): string[] {
    if (teams.length === 0) return [];
    return teams.flatMap(t => config.teamStatuses[t] || []);
}

// Apply preset filter to a list of statuses
function applyPresetFilter(statuses: string[], activePreset: PresetKey | null): string[] {
    if (!activePreset) return statuses;
    const matcher = PRESETS.find(p => p.key === activePreset);
    if (!matcher) return statuses;
    return statuses.filter(s => matcher.match(s));
}

interface Props {
    state: QuickFilterTeamState;
    onChange: (next: QuickFilterTeamState) => void;
    isDisabled: boolean;
    roadmapConfig?: RoadmapConfig;
}

export default function QuickFilterTeam({ state, onChange, isDisabled, roadmapConfig = DEFAULT_ROADMAP_CONFIG }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedTeams = new Set(state.teams);
    const count = state.teams.length;

    // Compute statuses from teams + presets using config
    const recomputeStatuses = useCallback((teams: string[], preset: PresetKey | null) => {
        const allTeamStatuses = getStatusesForTeams(teams, roadmapConfig);
        return applyPresetFilter(allTeamStatuses, preset);
    }, [roadmapConfig]);

    // ── Team handlers ──
    const toggleTeam = (role: string) => {
        const nextTeams = new Set(state.teams);
        if (nextTeams.has(role)) nextTeams.delete(role);
        else nextTeams.add(role);
        const teamsArr = Array.from(nextTeams);
        const statuses = recomputeStatuses(teamsArr, activePreset);
        onChange({ teams: teamsArr, statuses });
    };

    const selectAllTeams = () => {
        const teamsArr = [...roadmapConfig.teamRoles];
        const statuses = recomputeStatuses(teamsArr, activePreset);
        onChange({ teams: teamsArr, statuses });
    };

    const clearAll = () => {
        setActivePreset(null);
        onChange({ teams: [], statuses: [] });
    };

    // ── Preset handlers ──
    const togglePreset = (key: PresetKey) => {
        const next = activePreset === key ? null : key;
        setActivePreset(next);

        if (state.teams.length > 0) {
            const statuses = recomputeStatuses(state.teams, next);
            onChange({ ...state, statuses });
        }
    };

    const getPresetVisual = (key: PresetKey): 'active' | 'none' => {
        return activePreset === key ? 'active' : 'none';
    };

    return (
        <>
            <QuickFilterButton
                label="Team"
                count={count}
                isActive={count > 0}
                isDisabled={isDisabled}
                accentColor={ACCENT}
                onClick={handleButtonClick}
                isOpen={isOpen}
            />
            {isOpen && anchorRect && (
                <QuickFilterDropdown anchorRect={anchorRect} onClose={close}>
                    {/* Presets */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Presets</span>
                            {(state.teams.length > 0 || state.statuses.length > 0) && (
                                <button type="button" onClick={clearAll}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Clear all
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {PRESETS.map(preset => {
                                const visual = getPresetVisual(preset.key);
                                return (
                                    <button key={preset.key} type="button" onClick={() => togglePreset(preset.key)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            visual === 'active'
                                                ? 'border-transparent text-slate-900'
                                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={visual === 'active' ? { backgroundColor: ACCENT } : undefined}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Team selection */}
                    <div className="px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={selectAllTeams}
                                    className="text-[10px] font-semibold text-amber-600 hover:text-amber-700">
                                    Select all
                                </button>
                                {state.teams.length > 0 && (
                                    <button type="button" onClick={clearAll}
                                        className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {roadmapConfig.teamRoles.map(role => {
                                const checked = selectedTeams.has(role);
                                return (
                                    <label key={role} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                                        onClick={() => toggleTeam(role)}>
                                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                            checked ? 'border-transparent text-white' : 'border-gray-300'
                                        }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                            {checked && <Check size={10} strokeWidth={3} />}
                                        </span>
                                        <span className="text-xs text-gray-700">{role}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {/* Summary of active statuses */}
                        {state.statuses.length > 0 && (
                            <div className="mt-2 rounded bg-gray-50 px-2 py-1.5">
                                <div className="flex flex-wrap gap-1">
                                    {state.statuses.map(s => (
                                        <span key={s} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
