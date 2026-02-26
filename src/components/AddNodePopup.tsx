'use client';

import { useState, useEffect } from 'react';
import { RoadmapItem, ItemType, ItemStatus } from '@/types/roadmap';
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleAdd = () => {
        if (!name.trim()) return;
        const newItem: RoadmapItem = {
            id: uuidv4().slice(0, 8),
            name: name.trim(),
            type: childType,
            status: 'Not Started',
            progress: 0,
            children: childType !== 'feature' ? [] : undefined,
        };
        onAdd(parentId, newItem);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-[380px] p-6 flex flex-col gap-4 border border-gray-200"
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

                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button onClick={handleAdd} className="px-4 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700">Add</button>
                </div>
            </div>
        </div>
    );
}
