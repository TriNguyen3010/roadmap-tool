'use client';

import { useState, useEffect } from 'react';
import { RoadmapItem, ItemType, ItemStatus, TeamRole, TEAM_ROLES } from '@/types/roadmap';
import { v4 as uuidv4 } from 'uuid';
import { X } from 'lucide-react';

interface AddNodePopupProps {
    parentId: string;
    parentName: string;
    childType: ItemType;
    onAdd: (parentId: string, newItem: RoadmapItem) => void;
    onClose: () => void;
}

export default function AddNodePopup({ parentId, parentName, childType, onAdd, onClose }: AddNodePopupProps) {
    const [name, setName] = useState('');
    const [selectedTeams, setSelectedTeams] = useState<Set<TeamRole>>(new Set());
    const DEFAULT_SUBCATEGORIES = ['App', 'Web', 'Extension', 'Core'] as const;
    const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set(DEFAULT_SUBCATEGORIES));

    const toggleSubcategory = (sub: string) => {
        const next = new Set(selectedSubcategories);
        if (next.has(sub)) next.delete(sub);
        else next.add(sub);
        setSelectedSubcategories(next);
    };

    const toggleTeam = (role: TeamRole) => {
        const next = new Set(selectedTeams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        setSelectedTeams(next);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleAdd = () => {
        if (!name.trim()) return;

        let children: RoadmapItem[] | undefined = undefined;

        if (childType === 'category') {
            children = DEFAULT_SUBCATEGORIES
                .filter(sub => selectedSubcategories.has(sub))
                .map(sub => ({
                    id: uuidv4().slice(0, 8),
                    name: sub,
                    type: 'subcategory' as const,
                    status: 'Not Started' as const,
                    progress: 0,
                    children: []
                }));
        } else if (childType === 'feature' && selectedTeams.size > 0) {
            children = Array.from(selectedTeams).map(role => ({
                id: uuidv4().slice(0, 8),
                name: role,
                type: 'team' as const,
                teamRole: role,
                status: 'Not Started' as const,
                progress: 0
            }));
        } else if (childType !== 'feature' && childType !== 'team') {
            children = [];
        }

        const newItem: RoadmapItem = {
            id: uuidv4().slice(0, 8),
            name: name.trim(),
            type: childType,
            status: 'Not Started',
            progress: 0,
            children,
        };
        onAdd(parentId, newItem);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/10 transition-colors" onClick={onClose}>
            <div
                className="bg-white w-[380px] h-full shadow-2xl p-6 flex flex-col gap-4 border-l border-gray-200 animate-in slide-in-from-right overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-800">Add {childType} to "{parentName}"</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Name</label>
                    <input
                        autoFocus
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        placeholder={`Enter ${childType} name...`}
                    />
                </div>

                {childType === 'category' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                        <label className="text-xs font-semibold text-gray-600">Subcategories (mặc định tạo kèm)</label>
                        <div className="flex flex-wrap gap-2">
                            {DEFAULT_SUBCATEGORIES.map(sub => {
                                const isSelected = selectedSubcategories.has(sub);
                                return (
                                    <label key={sub} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSubcategory(sub)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className={isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}>{sub}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-gray-400">Bỏ tick nếu không muốn tạo subcategory đó.</p>
                    </div>
                )}

                {childType === 'feature' && (
                    <div className="flex flex-col gap-1.5 mt-2">
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

                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button onClick={handleAdd} className="px-4 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700">Add</button>
                </div>
            </div>
        </div>
    );
}
