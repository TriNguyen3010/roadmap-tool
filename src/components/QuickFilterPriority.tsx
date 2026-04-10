'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { PRIORITY_LEVELS, DEFAULT_ROADMAP_CONFIG, type RoadmapConfig } from '@/types/roadmap';
import type { QuickFilterPriorityState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#F0B90B';
const VISIBLE_PRIORITIES = PRIORITY_LEVELS.filter(p => p !== 'Reported');

interface Props {
    state: QuickFilterPriorityState;
    onChange: (next: QuickFilterPriorityState) => void;
    isDisabled: boolean;
    roadmapConfig?: RoadmapConfig;
}

export default function QuickFilterPriority({ state, onChange, isDisabled, roadmapConfig = DEFAULT_ROADMAP_CONFIG }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedPriorities = new Set(state.priorities);
    const selectedTeams = new Set(state.teams);
    const count = state.priorities.length + state.teams.length;

    const applyPriorityPreset = (value: string) => {
        const isExact = state.priorities.length === 1 && state.priorities[0] === value;
        if (isExact) {
            onChange({ ...state, priorities: [] });
        } else {
            onChange({ priorities: [value], teams: state.teams });
        }
    };

    const toggleTeam = (role: string) => {
        const next = new Set(state.teams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        onChange({ ...state, teams: Array.from(next) });
    };

    const selectAllTeams = () => {
        onChange({ ...state, teams: [...roadmapConfig.teamRoles] });
    };

    const clearTeams = () => {
        onChange({ ...state, teams: [] });
    };

    return (
        <>
            <QuickFilterButton
                label="Priority"
                count={count}
                isActive={count > 0}
                isDisabled={isDisabled}
                accentColor={ACCENT}
                onClick={handleButtonClick}
                isOpen={isOpen}
            />
            {isOpen && anchorRect && (
                <QuickFilterDropdown anchorRect={anchorRect} onClose={close}>
                    {/* Priority selection */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Priority</span>
                            {count > 0 && (
                                <button type="button" onClick={() => onChange({ ...state, priorities: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Clear
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {VISIBLE_PRIORITIES.map(p => {
                                const isExact = state.priorities.length === 1 && state.priorities[0] === p;
                                const isSelected = selectedPriorities.has(p);
                                return (
                                    <button key={p} type="button" onClick={() => applyPriorityPreset(p)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            isExact
                                                ? 'border-transparent text-slate-900'
                                                : isSelected
                                                    ? 'border-transparent text-slate-900 opacity-80'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={isSelected ? { backgroundColor: ACCENT } : undefined}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Team sub-filter */}
                    <div className="px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={selectAllTeams}
                                    className="text-[10px] font-semibold text-amber-600 hover:text-amber-700">
                                    Select all
                                </button>
                                <button type="button" onClick={clearTeams}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Clear
                                </button>
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
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
