'use client';

import { useState } from 'react';
import { Milestone, normalizeWeekColor, WEEK_COLOR_PALETTE } from '@/types/roadmap';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Plus } from 'lucide-react';
import SidePanelShell from './SidePanelShell';

interface MilestoneEditorProps {
    milestones: Milestone[];
    onSave: (milestones: Milestone[]) => void;
    onApplyPhase: (phaseId: string, milestones: Milestone[]) => void | Promise<void>;
    onApplyAll: (milestones: Milestone[]) => void | Promise<void>;
    isApplyingDates?: boolean;
    onClose: () => void;
}

const PRESET_COLORS = WEEK_COLOR_PALETTE;

export default function MilestoneEditor({
    milestones,
    onSave,
    onApplyPhase,
    onApplyAll,
    isApplyingDates = false,
    onClose,
}: MilestoneEditorProps) {
    const [list, setList] = useState<Milestone[]>(milestones);
    const [error, setError] = useState<string | null>(null);

    const update = (id: string, field: keyof Milestone, value: string) => {
        setError(null);
        setList(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const addNew = () => {
        setError(null);
        setList(prev => [...prev, {
            id: uuidv4().slice(0, 8),
            label: 'Week mới',
            startDate: '',
            endDate: '',
            color: normalizeWeekColor('', prev.length),
        }]);
    };

    const remove = (id: string) => {
        setError(null);
        setList(prev => prev.filter(m => m.id !== id));
    };

    const normalizeMilestoneForSave = (milestone: Milestone, index: number): Milestone | null => {
        const id = (milestone.id || '').trim() || `phase_${index + 1}`;
        const label = (milestone.label || '').trim();
        if (!label) {
            setError(`Week #${index + 1} chưa có tên.`);
            return null;
        }
        let startDate = (milestone.startDate || '').trim();
        let endDate = (milestone.endDate || '').trim();
        if (startDate && !endDate) {
            endDate = startDate;
        } else if (!startDate && endDate) {
            startDate = endDate;
        }
        if (startDate && endDate && startDate > endDate) {
            setError(`Week "${label}" có ngày bắt đầu lớn hơn ngày kết thúc.`);
            return null;
        }
        return {
            ...milestone,
            id,
            label,
            color: normalizeWeekColor(milestone.color, index),
            startDate,
            endDate,
        };
    };

    const handleSave = () => {
        setError(null);
        const normalized: Milestone[] = [];
        for (let i = 0; i < list.length; i++) {
            const next = normalizeMilestoneForSave(list[i], i);
            if (!next) return;
            normalized.push(next);
        }
        onSave(normalized);
        onClose();
    };

    return (
        <SidePanelShell
            isOpen
            onClose={onClose}
            title="Quản lý Week"
            subtitle="Week có thể không có ngày (Unscheduled)"
            widthClassName="w-[620px]"
            footer={(
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={addNew}
                            className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900 font-semibold"
                        >
                            <Plus size={15} /> Thêm week mới
                        </button>
                        <button
                            onClick={() => { void onApplyAll(list); }}
                            disabled={isApplyingDates || list.length === 0}
                            className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Apply all
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">Huỷ</button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        >
                            Lưu
                        </button>
                    </div>
                </div>
            )}
        >
            <div className="flex flex-col gap-3">
                {list.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Chưa có week nào. Nhấn &quot;+ Thêm&quot; để tạo mới.</p>
                )}
                {list.map((m) => (
                    <div key={m.id} className="flex gap-2 items-center bg-gray-50 rounded-lg p-3 border border-gray-200">
                        {/* Color picker */}
                        <div className="flex flex-col gap-1 shrink-0">
                            <label className="text-[10px] text-gray-500 font-semibold">Màu</label>
                            <div className="flex gap-1">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => update(m.id, 'color', c)}
                                        className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                                        style={{ backgroundColor: c, borderColor: m.color === c ? '#1f2937' : 'transparent' }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Label */}
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] text-gray-500 font-semibold">Tên week</label>
                            <input
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={m.label}
                                onChange={e => update(m.id, 'label', e.target.value)}
                            />
                        </div>

                        {/* Start Date */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-gray-500 font-semibold">Từ ngày</label>
                            <input
                                type="date"
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={m.startDate}
                                onChange={e => update(m.id, 'startDate', e.target.value)}
                            />
                        </div>

                        {/* End Date */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-gray-500 font-semibold">Đến ngày</label>
                            <input
                                type="date"
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={m.endDate}
                                onChange={e => update(m.id, 'endDate', e.target.value)}
                            />
                        </div>

                        <div className="shrink-0 mt-4 min-w-[130px] text-right">
                            <div className="text-[10px] font-semibold text-gray-500">
                                {(!m.startDate && !m.endDate) ? 'Unscheduled' : 'Scheduled'}
                            </div>
                            <button
                                type="button"
                                onClick={() => { void onApplyPhase(m.id, list); }}
                                disabled={isApplyingDates || !m.startDate || !m.endDate}
                                className="mt-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                                title={!m.startDate || !m.endDate ? 'Week chưa có lịch nên không thể apply' : 'Apply date week này cho group'}
                            >
                                Apply to groups
                            </button>
                        </div>

                        {/* Delete */}
                        <button onClick={() => remove(m.id)} className="text-red-400 hover:text-red-600 mt-4">
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
                {error && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                        {error}
                    </div>
                )}
            </div>
        </SidePanelShell>
    );
}
