'use client';

import { useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface QuickFilterButtonProps {
    label: string;
    count: number;
    isActive: boolean;
    isDisabled: boolean;
    accentColor: string;
    onClick: (rect: DOMRect) => void;
    isOpen: boolean;
}

export default function QuickFilterButton({
    label,
    count,
    isActive,
    isDisabled,
    accentColor,
    onClick,
    isOpen,
}: QuickFilterButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);

    const handleClick = useCallback(() => {
        if (isDisabled) return;
        if (ref.current) {
            onClick(ref.current.getBoundingClientRect());
        }
    }, [isDisabled, onClick]);

    const displayLabel = count > 0 ? `${label} (${count})` : label;

    return (
        <button
            ref={ref}
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-[9px] border px-2.5 text-xs font-semibold transition-colors ${
                isDisabled
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                    : isActive
                        ? 'border-transparent text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
            }`}
            style={isActive && !isDisabled ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            title={isDisabled ? 'Tắt filter đang active để dùng filter này' : undefined}
        >
            <span className="truncate max-w-[100px]">{displayLabel}</span>
            <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
    );
}
