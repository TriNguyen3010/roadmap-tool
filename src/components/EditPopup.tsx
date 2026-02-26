'use client';

import { useState, useEffect } from 'react';
import { RoadmapItem, ItemStatus, SubcategoryType } from '@/types/roadmap';
import { X } from 'lucide-react';

interface EditPopupProps {
    item: RoadmapItem;
    onSave: (updated: RoadmapItem) => void;
    onClose: () => void;
}

const SUBCATEGORY_TYPES: SubcategoryType[] = ['Feature', 'Bug', 'Growth Camp'];

const SUB_TYPE_STYLE: Record<SubcategoryType, { bg: string; text: string; border: string }> = {
    'Feature': { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    'Bug': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
    'Growth Camp': { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
};

export default function EditPopup({ item, onSave, onClose }: EditPopupProps) {
    const [name, setName] = useState(item.name);
    const [status, setStatus] = useState<ItemStatus>(item.status);
    const [progress, setProgress] = useState(item.progress ?? 0);
    const [startDate, setStartDate] = useState(item.startDate || '');
    const [endDate, setEndDate] = useState(item.endDate || '');
    const [subcategoryType, setSubcategoryType] = useState<SubcategoryType | undefined>(item.subcategoryType);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleStatusChange = (s: ItemStatus) => {
        setStatus(s);
        if (s === 'Done') setProgress(100);
        if (s === 'Not Started') setProgress(0);
    };

    const handleProgressChange = (v: number) => {
        setProgress(v);
        if (v === 100) setStatus('Done');
        else if (v === 0) setStatus('Not Started');
        else setStatus('In Progress');
    };

    const handleSubmit = () => {
        onSave({
            ...item,
            name,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            status,
            progress,
            subcategoryType: item.type === 'subcategory' ? subcategoryType : undefined,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-[440px] p-6 flex flex-col gap-4 border border-gray-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-800">
                        Chỉnh sửa · <span className="text-gray-400 font-normal text-sm">{item.type}</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>

                {/* Subcategory Type (only for subcategory items) */}
                {item.type === 'subcategory' && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600">Loại</label>
                        <div className="flex gap-2">
                            {SUBCATEGORY_TYPES.map(t => {
                                const s = SUB_TYPE_STYLE[t];
                                const isSelected = subcategoryType === t;
                                return (
                                    <button
                                        key={t}
                                        onClick={() => setSubcategoryType(isSelected ? undefined : t)}
                                        className="px-3 py-1 rounded-full text-xs font-bold border-2 transition-all"
                                        style={{
                                            backgroundColor: isSelected ? s.bg : '#f9fafb',
                                            color: isSelected ? s.text : '#9ca3af',
                                            borderColor: isSelected ? s.border : '#e5e7eb',
                                        }}
                                    >
                                        {t}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Name */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Tên</label>
                    <input
                        autoFocus
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    />
                </div>

                {/* Start / End Date */}
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày bắt đầu</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày kết thúc</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Trạng thái</label>
                    <select
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={status}
                        onChange={(e) => handleStatusChange(e.target.value as ItemStatus)}
                    >
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                    </select>
                </div>

                {/* Progress */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">
                        Tiến độ: <span className="text-blue-600 font-bold">{progress}%</span>
                    </label>
                    <input
                        type="range" min={0} max={100} step={5} value={progress}
                        onChange={(e) => handleProgressChange(Number(e.target.value))}
                        className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end mt-1">
                    <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">Huỷ</button>
                    <button onClick={handleSubmit} className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Lưu</button>
                </div>
            </div>
        </div>
    );
}
