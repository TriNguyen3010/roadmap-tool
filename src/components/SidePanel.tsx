'use client';

import { useMemo, useState } from 'react';
import { Save, X, Filter, Flag, Trash2, Plus, RotateCcw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Milestone } from '@/types/roadmap';

interface SidePanelProps {
    isOpen: boolean;
    activeTab: 'filter' | 'milestones';
    onTabChange: (tab: 'filter' | 'milestones') => void;
    onClose: () => void;
    canEdit: boolean;
    availableCategories: string[];
    availableTeams: string[];
    availableSubcategories: string[];
    filterCategory: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterSubcategory: string[];
    onFilterChange: (type: 'category' | 'status' | 'team' | 'priority' | 'subcategory', values: string[]) => void;
    onSaveView: () => void;
    milestones: Milestone[];
    onSaveMilestones: (milestones: Milestone[]) => void;
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function SidePanel({
    isOpen, activeTab, onTabChange, onClose, canEdit,
    availableCategories, availableTeams, availableSubcategories,
    filterCategory, filterStatus, filterTeam, filterPriority, filterSubcategory,
    onFilterChange, onSaveView,
    milestones, onSaveMilestones,
}: SidePanelProps) {
    const [milestoneDraft, setMilestoneDraft] = useState<Milestone[]>(milestones);
    const [milestoneDirty, setMilestoneDirty] = useState(false);

    const activeFilterCount = useMemo(
        () => filterCategory.length + filterStatus.length + filterTeam.length + filterPriority.length + filterSubcategory.length,
        [filterCategory, filterStatus, filterTeam, filterPriority, filterSubcategory]
    );
    const scopeFilterCount = filterCategory.length + filterSubcategory.length;

    const toggleFilter = (type: 'category' | 'status' | 'team' | 'priority' | 'subcategory', value: string, current: string[]) => {
        if (current.includes(value)) {
            onFilterChange(type, current.filter(item => item !== value));
        } else {
            onFilterChange(type, [...current, value]);
        }
    };

    const clearAllFilters = () => {
        onFilterChange('category', []);
        onFilterChange('status', []);
        onFilterChange('team', []);
        onFilterChange('priority', []);
        onFilterChange('subcategory', []);
    };

    const updateMilestone = (id: string, field: keyof Milestone, value: string) => {
        if (!canEdit) return;
        setMilestoneDraft(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)));
        setMilestoneDirty(true);
    };

    const addMilestone = () => {
        if (!canEdit) return;
        setMilestoneDraft(prev => [
            ...prev,
            {
                id: uuidv4().slice(0, 8),
                label: 'Milestone mới',
                startDate: '',
                endDate: '',
                color: '#ef4444',
            },
        ]);
        setMilestoneDirty(true);
    };

    const removeMilestone = (id: string) => {
        if (!canEdit) return;
        setMilestoneDraft(prev => prev.filter(m => m.id !== id));
        setMilestoneDirty(true);
    };

    const resetMilestones = () => {
        setMilestoneDraft(milestones);
        setMilestoneDirty(false);
    };

    const saveMilestones = () => {
        if (!canEdit) return;
        onSaveMilestones(milestoneDraft);
        setMilestoneDirty(false);
    };

    if (!isOpen) return null;

    return (
        <aside className="w-[360px] shrink-0 border-l-2 border-gray-300 bg-white flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Side Panel</p>
                    <p className="text-sm font-bold text-gray-800">
                        {activeTab === 'filter' ? 'Bộ lọc hiển thị' : 'Milestones & Deadline'}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-gray-200 transition-colors"
                    title="Đóng panel"
                >
                    <X size={16} className="text-gray-500" />
                </button>
            </div>

            <div className="grid grid-cols-2 border-b border-gray-200 bg-white">
                <button
                    onClick={() => onTabChange('filter')}
                    className={`px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'filter' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    <Filter size={13} />
                    <span>Filter ({activeFilterCount})</span>
                </button>
                <button
                    onClick={() => onTabChange('milestones')}
                    className={`px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'milestones' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    <Flag size={13} />
                    <span>Milestones ({milestoneDraft.length})</span>
                </button>
            </div>

            {activeTab === 'filter' ? (
                <>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                        {(availableCategories.length > 0 || availableSubcategories.length > 0) && (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Scope ({scopeFilterCount})</p>

                                {availableCategories.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-gray-500 mb-2">Category</p>
                                        <div className="flex flex-col gap-2">
                                            {availableCategories.map(cat => (
                                                <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterCategory.includes(cat)}
                                                        onChange={() => toggleFilter('category', cat, filterCategory)}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{cat}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {availableSubcategories.length > 0 && (
                                    <div className="mt-3 border-t border-gray-200 pt-3">
                                        <p className="text-[10px] font-semibold text-gray-500 mb-2">Subcategory</p>
                                        <div className="flex flex-col gap-2">
                                            {availableSubcategories.map(sub => (
                                                <label key={sub} className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterSubcategory.includes(sub)}
                                                        onChange={() => toggleFilter('subcategory', sub, filterSubcategory)}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{sub}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 border-t border-gray-100 pt-3">Status</p>
                            <div className="flex flex-col gap-2">
                                {['Done', 'In Progress', 'Not Started'].map(st => (
                                    <label key={st} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={filterStatus.includes(st)}
                                            onChange={() => toggleFilter('status', st, filterStatus)}
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{st}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 border-t border-gray-100 pt-3">Priority</p>
                            <div className="flex flex-col gap-2">
                                {['High', 'Medium', 'Low'].map(p => (
                                    <label key={p} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={filterPriority.includes(p)}
                                            onChange={() => toggleFilter('priority', p, filterPriority)}
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{p}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {availableTeams.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 border-t border-gray-100 pt-3">Teams</p>
                                <div className="flex flex-col gap-2">
                                    {availableTeams.map(tm => (
                                        <label key={tm} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={filterTeam.includes(tm)}
                                                onChange={() => toggleFilter('team', tm, filterTeam)}
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{tm}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2">
                        <button
                            onClick={clearAllFilters}
                            disabled={activeFilterCount === 0}
                            className="w-full text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50 text-gray-600 border border-gray-300 hover:bg-gray-100"
                        >
                            Xóa bộ lọc (Show All)
                        </button>
                        <button
                            onClick={onSaveView}
                            disabled={!canEdit}
                            title={!canEdit ? 'Viewer mode: cần Unlock Editor để lưu view' : 'Lưu View'}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition-colors text-white bg-blue-600 hover:bg-blue-700 shadow-sm disabled:bg-blue-300"
                        >
                            <Save size={12} />
                            <span>Lưu View (Mặc định)</span>
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        {!canEdit && (
                            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Viewer mode: bạn có thể xem milestone, cần unlock Editor để chỉnh sửa và lưu.
                            </div>
                        )}

                        {milestoneDraft.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">Chưa có mốc nào.</p>
                        )}

                        {milestoneDraft.map((m) => (
                            <div key={m.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Màu</p>
                                    <button
                                        onClick={() => removeMilestone(m.id)}
                                        disabled={!canEdit}
                                        className="text-red-400 hover:text-red-600 disabled:text-gray-300"
                                        title="Xóa milestone"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="flex gap-1.5 flex-wrap">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => updateMilestone(m.id, 'color', c)}
                                            disabled={!canEdit}
                                            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 disabled:hover:scale-100 disabled:opacity-60"
                                            style={{ backgroundColor: c, borderColor: m.color === c ? '#1f2937' : 'transparent' }}
                                        />
                                    ))}
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-gray-500 font-semibold">Tên mốc</label>
                                    <input
                                        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                                        value={m.label}
                                        onChange={e => updateMilestone(m.id, 'label', e.target.value)}
                                        disabled={!canEdit}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-semibold">Từ ngày</label>
                                        <input
                                            type="date"
                                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                                            value={m.startDate}
                                            onChange={e => updateMilestone(m.id, 'startDate', e.target.value)}
                                            disabled={!canEdit}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-semibold">Đến ngày</label>
                                        <input
                                            type="date"
                                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                                            value={m.endDate}
                                            onChange={e => updateMilestone(m.id, 'endDate', e.target.value)}
                                            disabled={!canEdit}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2">
                        <button
                            onClick={addMilestone}
                            disabled={!canEdit}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded transition-colors text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300"
                        >
                            <Plus size={12} />
                            <span>Thêm milestone</span>
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={resetMilestones}
                                disabled={!canEdit || !milestoneDirty}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded transition-colors text-gray-600 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                                <RotateCcw size={12} />
                                <span>Hoàn tác</span>
                            </button>
                            <button
                                onClick={saveMilestones}
                                disabled={!canEdit || !milestoneDirty}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition-colors text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
                            >
                                <Save size={12} />
                                <span>Lưu</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
}
