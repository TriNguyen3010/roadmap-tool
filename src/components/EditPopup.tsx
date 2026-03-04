'use client';

import { useState, useEffect } from 'react';
import { RoadmapItem, ItemStatus, StatusMode, SubcategoryType, TeamRole, TEAM_ROLES } from '@/types/roadmap';
import { v4 as uuidv4 } from 'uuid';
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
    const hasChildren = !!(item.children && item.children.length > 0);
    const initialStatusMode: StatusMode = hasChildren ? (item.statusMode ?? 'auto') : 'manual';

    const [name, setName] = useState(item.name);
    const [statusMode, setStatusMode] = useState<StatusMode>(initialStatusMode);
    const [status, setStatus] = useState<ItemStatus>(item.manualStatus ?? item.status);
    const [progress, setProgress] = useState(item.progress ?? 0);
    const [startDate, setStartDate] = useState(item.startDate || '');
    const [endDate, setEndDate] = useState(item.endDate || '');
    const [subcategoryType, setSubcategoryType] = useState<SubcategoryType | undefined>(item.subcategoryType);

    // Dates/progress are locked when item has children that are NOT all teams
    const hasNonTeamChildren = !!(item.children && item.children.some(c => c.type !== 'team'));
    const isRolledUp = hasNonTeamChildren;

    // Initialize selectedTeams based on existing children that are of type 'team'
    const [selectedTeams, setSelectedTeams] = useState<Set<TeamRole>>(() => {
        const set = new Set<TeamRole>();
        if ((item.type === 'feature' || item.type === 'group') && item.children) {
            item.children.forEach(child => {
                if (child.type === 'team' && child.teamRole) set.add(child.teamRole);
            });
        }
        return set;
    });

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
        if (statusMode === 'manual') {
            if (v === 100) setStatus('Done');
            else if (v === 0) setStatus('Not Started');
            else setStatus('In Progress');
        }
    };

    const toggleTeam = (role: TeamRole) => {
        const next = new Set(selectedTeams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        setSelectedTeams(next);
    };

    const handleSubmit = () => {
        let updatedChildren = item.children;

        if (item.type === 'feature' || item.type === 'group') {
            const currentTeamsMap = new Map<TeamRole, RoadmapItem>();
            if (item.children) {
                item.children.forEach(child => {
                    if (child.type === 'team' && child.teamRole) {
                        currentTeamsMap.set(child.teamRole, child);
                    }
                });
            }

            const newChildren: RoadmapItem[] = item.children
                ? item.children.filter(child => child.type !== 'team')
                : [];

            selectedTeams.forEach(role => {
                if (currentTeamsMap.has(role)) {
                    newChildren.push(currentTeamsMap.get(role)!);
                } else {
                    newChildren.push({
                        id: uuidv4().slice(0, 8),
                        name: role,
                        type: 'team',
                        teamRole: role,
                        status: 'Not Started',
                        statusMode: 'manual',
                        manualStatus: 'Not Started',
                        progress: 0,
                        startDate: startDate || undefined,
                        endDate: endDate || undefined
                    });
                }
            });
            updatedChildren = newChildren;
        }

        const hasChildrenAfterUpdate = !!(updatedChildren && updatedChildren.length > 0);
        const nextStatusMode: StatusMode = hasChildrenAfterUpdate ? statusMode : 'manual';

        onSave({
            ...item,
            name,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            status: nextStatusMode === 'manual' ? status : item.status,
            statusMode: nextStatusMode,
            manualStatus: nextStatusMode === 'manual' ? status : undefined,
            progress,
            subcategoryType: item.type === 'subcategory' ? subcategoryType : undefined,
            children: updatedChildren
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/10 transition-colors" onClick={onClose}>
            <div
                className="bg-white w-[440px] h-full shadow-2xl p-6 flex flex-col gap-4 border-l border-gray-200 animate-in slide-in-from-right overflow-y-auto"
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
                    {item.type === 'team' ? (
                        <div className="border border-gray-200 bg-gray-50 rounded px-2 py-1.5 text-sm text-gray-700 font-medium">
                            {item.teamRole}
                        </div>
                    ) : (
                        <input
                            autoFocus
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    )}
                </div>

                {/* Teams */}
                {(item.type === 'feature' || item.type === 'group') && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600">Teams (Optional)</label>
                        <div className="flex flex-wrap gap-2">
                            {TEAM_ROLES.map(role => {
                                const isSelected = selectedTeams.has(role);
                                return (
                                    <label key={role} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleTeam(role)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className={isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}>{role}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Auto rollup notice */}
                {isRolledUp && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                        Thời gian và tiến độ được tự động tính toán từ các mục con.
                    </div>
                )}

                {/* Start / End Date */}
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày bắt đầu</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={isRolledUp}
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày kết thúc</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            disabled={isRolledUp}
                        />
                    </div>
                </div>

                {/* Status */}
                {hasChildren && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-600">Cách tính trạng thái</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setStatusMode('auto')}
                                className={`rounded border px-2 py-1.5 text-sm font-semibold transition-colors ${statusMode === 'auto'
                                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                Auto từ task con
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusMode('manual')}
                                className={`rounded border px-2 py-1.5 text-sm font-semibold transition-colors ${statusMode === 'manual'
                                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                Manual
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Trạng thái</label>
                    <select
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                        value={statusMode === 'manual' ? status : item.status}
                        onChange={(e) => handleStatusChange(e.target.value as ItemStatus)}
                        disabled={statusMode === 'auto'}
                    >
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                    </select>
                    {statusMode === 'auto' && (
                        <p className="text-[11px] text-gray-500">Status đang tự động theo task con.</p>
                    )}
                </div>

                {/* Progress */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">
                        Tiến độ: <span className="text-blue-600 font-bold">{progress}%</span>
                    </label>
                    <input
                        type="range" min={0} max={100} step={5} value={progress}
                        onChange={(e) => handleProgressChange(Number(e.target.value))}
                        className="w-full accent-blue-500 disabled:opacity-50"
                        disabled={isRolledUp}
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
