'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check } from 'lucide-react';
import { DEFAULT_ROADMAP_CONFIG, getAllStatusesFromConfig, type RoadmapConfig } from '@/types/roadmap';
import type { QuickFilterStatusState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#F0B90B';

const STATUS_PRESETS = [
    { label: 'In Progress', values: ['Task In progress'] },
    { label: 'To do', values: ['Task To do'] },
    { label: 'Done', values: ['Task Done'] },
];

interface Props {
    state: QuickFilterStatusState;
    onChange: (next: QuickFilterStatusState) => void;
    isDisabled: boolean;
    roadmapConfig?: RoadmapConfig;
}

export default function QuickFilterStatus({ state, onChange, isDisabled, roadmapConfig = DEFAULT_ROADMAP_CONFIG }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    // Build visible statuses from config: task statuses first, then team statuses
    const visibleStatuses = useMemo(() => {
        const taskSet = new Set(roadmapConfig.taskStatuses);
        const allStatuses = getAllStatusesFromConfig(roadmapConfig);
        const taskFirst = roadmapConfig.taskStatuses.filter(s => s !== 'None');
        const rest = allStatuses.filter(s => s !== 'None' && !taskSet.has(s));
        return [...taskFirst, ...rest];
    }, [roadmapConfig]);

    const selectedSet = new Set(state.statuses);
    const count = state.statuses.length;

    const toggleStatus = (value: string) => {
        const next = new Set(state.statuses);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange({ statuses: Array.from(next) });
    };

    const applyPreset = (preset: { label: string; values: string[] }) => {
        const presetSet = new Set(preset.values);
        const isExact = state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
        onChange({ statuses: isExact ? [] : [...preset.values] });
    };

    const isPresetExact = (preset: { values: string[] }): boolean => {
        const presetSet = new Set(preset.values);
        return state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
    };

    const isPresetPartial = (preset: { values: string[] }): boolean => {
        return state.statuses.length > 0 && preset.values.every(v => selectedSet.has(v));
    };

    return (
        <>
            <QuickFilterButton
                label="Status"
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
                            {count > 0 && (
                                <button type="button" onClick={() => onChange({ statuses: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Clear all
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {STATUS_PRESETS.map(preset => {
                                const exact = isPresetExact(preset);
                                const partial = isPresetPartial(preset);
                                return (
                                    <button key={preset.label} type="button" onClick={() => applyPreset(preset)}
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

                    {/* All statuses */}
                    <div className="max-h-56 overflow-y-auto px-1.5 py-1.5">
                        {visibleStatuses.map(option => {
                            const checked = selectedSet.has(option);
                            return (
                                <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                                    onClick={() => toggleStatus(option)}>
                                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                        checked ? 'border-transparent text-slate-900' : 'border-gray-300'
                                    }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                        {checked && <Check size={10} strokeWidth={3} />}
                                    </span>
                                    <span className="truncate text-xs text-gray-700">{option}</span>
                                </label>
                            );
                        })}
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
