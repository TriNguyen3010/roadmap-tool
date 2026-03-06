'use client';

import { Save } from 'lucide-react';
import SidePanelShell from './SidePanelShell';
import { PRIORITY_FILTER_NONE, PRIORITY_LEVELS, STATUS_OPTIONS } from '@/types/roadmap';

interface FilterPopupProps {
    isOpen: boolean;
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
}

export default function FilterPopup({
    isOpen,
    onClose,
    canEdit,
    availableCategories,
    availableTeams,
    availableSubcategories,
    filterCategory,
    filterStatus,
    filterTeam,
    filterPriority,
    filterSubcategory,
    onFilterChange,
    onSaveView,
}: FilterPopupProps) {
    const priorityFilterOptions = [...PRIORITY_LEVELS, PRIORITY_FILTER_NONE];
    const activeFilterCount = filterCategory.length + filterStatus.length + filterTeam.length + filterPriority.length + filterSubcategory.length;
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

    return (
        <SidePanelShell
            isOpen={isOpen}
            onClose={onClose}
            title={`Bộ lọc hiển thị (${activeFilterCount})`}
            subtitle="Các nhóm filter kết hợp theo AND (giao nhau)"
            widthClassName="w-[440px]"
            footer={(
                <div className="flex flex-col gap-2">
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
            )}
        >
            <div className="flex flex-col gap-4">
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
                        {STATUS_OPTIONS.map(st => (
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
                        {priorityFilterOptions.map(p => (
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
        </SidePanelShell>
    );
}
