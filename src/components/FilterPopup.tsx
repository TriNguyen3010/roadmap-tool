'use client';

import { Save } from 'lucide-react';
import SidePanelShell from './SidePanelShell';
import { GROUP_ITEM_TYPE_OPTIONS, PHASE_FILTER_NONE, PRIORITY_FILTER_NONE, PRIORITY_LEVELS, PhaseOption, STATUS_OPTIONS } from '@/types/roadmap';

interface FilterPopupProps {
    isOpen: boolean;
    onClose: () => void;
    canEdit: boolean;
    availableCategories: string[];
    availableTeams: string[];
    availablePhases: PhaseOption[];
    availableSubcategories: string[];
    filterCategory: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterPhase: string[];
    filterSubcategory: string[];
    filterGroupItemType: string[];
    onFilterChange: (type: 'category' | 'status' | 'team' | 'priority' | 'phase' | 'subcategory' | 'groupItemType', values: string[]) => void;
    onSaveView: () => void;
}

export default function FilterPopup({
    isOpen,
    onClose,
    canEdit,
    availableCategories,
    availableTeams,
    availablePhases,
    availableSubcategories,
    filterCategory,
    filterStatus,
    filterTeam,
    filterPriority,
    filterPhase,
    filterSubcategory,
    filterGroupItemType,
    onFilterChange,
    onSaveView,
}: FilterPopupProps) {
    const priorityFilterOptions = [...PRIORITY_LEVELS, PRIORITY_FILTER_NONE];
    const activeFilterCount = (
        filterCategory.length
        + filterStatus.length
        + filterTeam.length
        + filterPriority.length
        + filterPhase.length
        + filterSubcategory.length
        + filterGroupItemType.length
    );
    const scopeFilterCount = filterCategory.length + filterSubcategory.length;

    const toggleFilter = (type: 'category' | 'status' | 'team' | 'priority' | 'phase' | 'subcategory' | 'groupItemType', value: string, current: string[]) => {
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
        onFilterChange('phase', []);
        onFilterChange('subcategory', []);
        onFilterChange('groupItemType', []);
    };

    return (
        <SidePanelShell
            isOpen={isOpen}
            onClose={onClose}
            title={`Bộ lọc hiển thị (${activeFilterCount})`}
            subtitle="Các nhóm filter kết hợp theo AND (giao nhau)"
            widthClassName="w-[760px] max-w-[calc(100vw-24px)]"
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="min-w-0">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Scope ({scopeFilterCount})</p>

                        {availableCategories.length > 0 ? (
                            <div>
                                <p className="mb-2 text-[10px] font-semibold text-gray-500">Category</p>
                                <div className="max-h-[340px] space-y-2 overflow-auto pr-1">
                                    {availableCategories.map(cat => (
                                        <label key={cat} className="group flex cursor-pointer items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={filterCategory.includes(cat)}
                                                onChange={() => toggleFilter('category', cat, filterCategory)}
                                                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{cat}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-2 text-[11px] text-gray-500">
                                Chưa có category để lọc.
                            </div>
                        )}

                        {availableSubcategories.length > 0 ? (
                            <div className="mt-3 border-t border-gray-200 pt-3">
                                <p className="mb-2 text-[10px] font-semibold text-gray-500">Subcategory</p>
                                <div className="space-y-2">
                                    {availableSubcategories.map(sub => (
                                        <label key={sub} className="group flex cursor-pointer items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={filterSubcategory.includes(sub)}
                                                onChange={() => toggleFilter('subcategory', sub, filterSubcategory)}
                                                className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{sub}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 border-t border-gray-200 pt-3">
                                <div className="rounded border border-dashed border-gray-300 bg-white px-3 py-2 text-[11px] text-gray-500">
                                    Chưa có subcategory để lọc.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="min-w-0 space-y-3">
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">WorkType (Group)</p>
                        <div className="space-y-2">
                            {GROUP_ITEM_TYPE_OPTIONS.map(itemType => (
                                <label key={itemType} className="group flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={filterGroupItemType.includes(itemType)}
                                        onChange={() => toggleFilter('groupItemType', itemType, filterGroupItemType)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{itemType}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Phase</p>
                        {availablePhases.length === 0 ? (
                            <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                                Chưa có phase. Hãy tạo phase trong panel Phases.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {availablePhases.map(phase => (
                                    <label key={phase.id} className="group flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filterPhase.includes(phase.id)}
                                            onChange={() => toggleFilter('phase', phase.id, filterPhase)}
                                            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="truncate text-xs font-medium text-gray-700 group-hover:text-indigo-700">
                                            {phase.label}{!phase.hasSchedule ? ' (Unscheduled)' : ''}
                                        </span>
                                    </label>
                                ))}
                                <label className="group flex cursor-pointer items-center gap-2 border-t border-gray-100 pt-2">
                                    <input
                                        type="checkbox"
                                        checked={filterPhase.includes(PHASE_FILTER_NONE)}
                                        onChange={() => toggleFilter('phase', PHASE_FILTER_NONE, filterPhase)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">None (chưa gán phase)</span>
                                </label>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Status</p>
                        <div className="space-y-2">
                            {STATUS_OPTIONS.map(st => (
                                <label key={st} className="group flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={filterStatus.includes(st)}
                                        onChange={() => toggleFilter('status', st, filterStatus)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{st}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Priority</p>
                        <div className="space-y-2">
                            {priorityFilterOptions.map(p => (
                                <label key={p} className="group flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={filterPriority.includes(p)}
                                        onChange={() => toggleFilter('priority', p, filterPriority)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{p}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {availableTeams.length > 0 && (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Teams</p>
                            <div className="space-y-2">
                                {availableTeams.map(tm => (
                                    <label key={tm} className="group flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filterTeam.includes(tm)}
                                            onChange={() => toggleFilter('team', tm, filterTeam)}
                                            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{tm}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </SidePanelShell>
    );
}
