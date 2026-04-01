'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

interface DateMiniPopupProps {
    label: string;
    value: string | undefined;
    anchorRect: DOMRect;
    comparisonValue?: string;
    comparisonMode?: 'greater_than' | 'less_than';
    onSave: (date: string | undefined) => void;
    onClose: () => void;
}

const POPUP_WIDTH = 220;
const POPUP_HEIGHT = 142;
const VIEWPORT_PADDING = 8;

export default function DateMiniPopup({
    label,
    value,
    anchorRect,
    comparisonValue,
    comparisonMode,
    onSave,
    onClose,
}: DateMiniPopupProps) {
    const [dateValue, setDateValue] = useState(value || '');

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-date-mini-popup="true"]')) return;
            if (target.closest('[data-date-cell-trigger="true"]')) return;
            onClose();
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const popupStyle = useMemo<CSSProperties>(() => {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : anchorRect.right + POPUP_WIDTH;
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : anchorRect.bottom + POPUP_HEIGHT;
        const spaceBelow = viewportHeight - anchorRect.bottom;
        const openAbove = spaceBelow < POPUP_HEIGHT;

        const top = openAbove
            ? Math.max(VIEWPORT_PADDING, anchorRect.top - POPUP_HEIGHT - 4)
            : Math.min(viewportHeight - POPUP_HEIGHT - VIEWPORT_PADDING, anchorRect.bottom + 4);
        const left = Math.min(
            Math.max(VIEWPORT_PADDING, anchorRect.left),
            Math.max(VIEWPORT_PADDING, viewportWidth - POPUP_WIDTH - VIEWPORT_PADDING)
        );

        return {
            position: 'fixed',
            top,
            left,
            zIndex: 9999,
        };
    }, [anchorRect]);

    const handleConfirm = () => {
        onSave(dateValue || undefined);
    };

    const handleClear = () => {
        onSave(undefined);
    };

    const warningText = useMemo(() => {
        if (!dateValue || !comparisonValue || !comparisonMode) return null;
        if (comparisonMode === 'greater_than' && dateValue > comparisonValue) {
            return 'Ngày này đang lớn hơn mốc còn lại.';
        }
        if (comparisonMode === 'less_than' && dateValue < comparisonValue) {
            return 'Ngày này đang nhỏ hơn mốc còn lại.';
        }
        return null;
    }, [comparisonMode, comparisonValue, dateValue]);

    return (
        <div
            style={popupStyle}
            data-date-mini-popup="true"
            className="w-[220px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
            <div className="mb-2 text-xs font-medium text-gray-500">{label}</div>
            <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                autoFocus
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {warningText && (
                <p className="mt-2 text-[11px] text-amber-600">{warningText}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs font-medium text-rose-500 transition-colors hover:text-rose-700"
                >
                    Xoá ngày
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                    OK
                </button>
            </div>
        </div>
    );
}
