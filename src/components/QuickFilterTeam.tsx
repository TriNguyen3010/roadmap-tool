'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { STATUS_OPTIONS, TEAM_ROLES } from '@/types/roadmap';
import type { QuickFilterTeamState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#F0B90B';

const STATUS_PRESET_DOING = {
    label: 'Đang làm',
    values: STATUS_OPTIONS.filter(s =>
        s.includes('Handle') || s.includes('in progress') || s === 'Task Pending'
    ),
};
const STATUS_PRESET_TODO = {
    label: 'To do',
    values: ['Not Started', 'Task To do'],
};
const STATUS_PRESET_DONE = {
    label: 'Done',
    values: STATUS_OPTIONS.filter(s => s.includes('Done')),
};
const STATUS_PRESETS = [STATUS_PRESET_DOING, STATUS_PRESET_TODO, STATUS_PRESET_DONE];

interface Props {
    state: QuickFilterTeamState;
    onChange: (next: QuickFilterTeamState) => void;
    isDisabled: boolean;
}

export default function QuickFilterTeam({ state, onChange, isDisabled }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedTeams = new Set(state.teams);
    const selectedStatuses = new Set(state.statuses);
    const count = state.teams.length;

    const toggleTeam = (role: string) => {
        const next = new Set(state.teams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        onChange({ ...state, teams: Array.from(next) });
    };

    const selectAllTeams = () => {
        onChange({ ...state, teams: [...TEAM_ROLES] });
    };

    const clearTeams = () => {
        onChange({ ...state, teams: [] });
    };

    const applyStatusPreset = (preset: { values: string[] }) => {
        const presetSet = new Set(preset.values);
        const isExact = state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
        onChange({ ...state, statuses: isExact ? [] : [...preset.values] });
    };

    const isStatusPresetExact = (preset: { values: string[] }): boolean => {
        const presetSet = new Set(preset.values);
        return state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
    };

    const isStatusPresetPartial = (preset: { values: string[] }): boolean => {
        return state.statuses.length > 0 && preset.values.every(v => selectedStatuses.has(v));
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
                    {/* Status sub-filter */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trạng thái</span>
                            {state.statuses.length > 0 && (
                                <button type="button" onClick={() => onChange({ ...state, statuses: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoá
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {STATUS_PRESETS.map(preset => {
                                const exact = isStatusPresetExact(preset);
                                const partial = isStatusPresetPartial(preset);
                                return (
                                    <button key={preset.label} type="button" onClick={() => applyStatusPreset(preset)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            exact
                                                ? 'border-transparent text-slate-900'
                                                : partial
                                                    ? 'border-transparent text-slate-900 opacity-80'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={exact || partial ? { backgroundColor: ACCENT } : undefined}
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
                                    Chọn hết
                                </button>
                                <button type="button" onClick={clearTeams}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoá
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {TEAM_ROLES.map(role => {
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
