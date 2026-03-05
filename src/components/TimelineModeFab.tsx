'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import { TimelineMode } from '@/types/roadmap';

interface TimelineModeFabProps {
    mode: TimelineMode;
    onModeChange: (mode: TimelineMode) => void;
}

const MODE_OPTIONS: Array<{ value: TimelineMode; label: string; icon: ComponentType<{ size?: number }> }> = [
    { value: 'day', label: 'Ngày', icon: CalendarDays },
    { value: 'week', label: 'Tuần', icon: CalendarRange },
    { value: 'month', label: 'Tháng', icon: Calendar },
];

export default function TimelineModeFab({ mode, onModeChange }: TimelineModeFabProps) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onEscape);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onEscape);
        };
    }, [open]);

    return (
        <div ref={wrapperRef} className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
            {open && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-2xl p-2 w-36">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1.5 pb-1">Timeline</p>
                    <div className="flex flex-col gap-1">
                        {MODE_OPTIONS.map(option => {
                            const Icon = option.icon;
                            const active = mode === option.value;
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => { onModeChange(option.value); setOpen(false); }}
                                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${active
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    <Icon size={13} />
                                    <span>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <button
                onClick={() => setOpen(prev => !prev)}
                className="h-11 w-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center transition-colors"
                title="Điều chỉnh timeline"
                aria-label="Điều chỉnh timeline"
            >
                <CalendarRange size={18} />
            </button>
        </div>
    );
}
