'use client';

import { useState } from 'react';
import { Milestone } from '@/types/roadmap';
import { v4 as uuidv4 } from 'uuid';
import { X, Trash2, Plus } from 'lucide-react';

interface MilestoneEditorProps {
    milestones: Milestone[];
    onSave: (milestones: Milestone[]) => void;
    onClose: () => void;
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function MilestoneEditor({ milestones, onSave, onClose }: MilestoneEditorProps) {
    const [list, setList] = useState<Milestone[]>(milestones);

    const update = (id: string, field: keyof Milestone, value: string) => {
        setList(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const addNew = () => {
        setList(prev => [...prev, {
            id: uuidv4().slice(0, 8),
            label: 'Milestone mới',
            startDate: '',
            endDate: '',
            color: '#ef4444',
        }]);
    };

    const remove = (id: string) => {
        setList(prev => prev.filter(m => m.id !== id));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col border border-gray-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-base font-bold text-gray-800">Quản lý Deadline & Mốc sự kiện</h2>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-700" /></button>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-3">
                    {list.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">Chưa có mốc nào. Nhấn &quot;+ Thêm&quot; để tạo mới.</p>
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
                                <label className="text-[10px] text-gray-500 font-semibold">Tên</label>
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

                            {/* Delete */}
                            <button onClick={() => remove(m.id)} className="text-red-400 hover:text-red-600 mt-4">
                                <Trash2 size={15} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                    <button
                        onClick={addNew}
                        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900 font-semibold"
                    >
                        <Plus size={15} /> Thêm mốc mới
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">Huỷ</button>
                        <button
                            onClick={() => { onSave(list); onClose(); }}
                            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        >
                            Lưu
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
