'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    addDays,
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    parseISO,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateMiniPopupProps {
    label: string;
    value: string | undefined;
    anchorRect: DOMRect;
    comparisonValue?: string;
    comparisonMode?: 'greater_than' | 'less_than';
    onSave: (date: string | undefined) => void;
    onClose: () => void;
}

const POPUP_WIDTH = 304;
const POPUP_HEIGHT = 392;
const VIEWPORT_PADDING = 8;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseDateValue(value: string | undefined): Date | null {
    if (!value) return null;
    try {
        return parseISO(value);
    } catch {
        return null;
    }
}

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
    const [visibleMonth, setVisibleMonth] = useState<Date>(() => parseDateValue(value) ?? new Date());

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

    const selectedDate = useMemo(() => parseDateValue(dateValue), [dateValue]);
    const today = useMemo(() => new Date(), []);

    const calendarDays = useMemo(() => {
        const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 });
        const days: Date[] = [];

        for (let day = start; day <= end; day = addDays(day, 1)) {
            days.push(day);
        }

        return days;
    }, [visibleMonth]);

    const displayValue = useMemo(() => {
        const parsed = parseDateValue(dateValue);
        return parsed ? format(parsed, 'dd/MM/yyyy') : '';
    }, [dateValue]);

    const handleSelectDay = (day: Date) => {
        setDateValue(format(day, 'yyyy-MM-dd'));
        setVisibleMonth(day);
    };

    return (
        <div
            style={popupStyle}
            data-date-mini-popup="true"
            className="w-[304px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
        >
            <div className="mb-2 text-xs font-medium text-gray-500">{label}</div>
            <div className="relative mb-3">
                <input
                    type="text"
                    value={displayValue}
                    readOnly
                    placeholder="Chưa chọn ngày"
                    className="w-full rounded-xl border border-blue-500 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none"
                />
                <CalendarDays
                    size={17}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700"
                />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setVisibleMonth(prev => subMonths(prev, 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                        aria-label="Tháng trước"
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <div className="text-sm font-semibold text-slate-800">
                        {format(visibleMonth, 'MM/yyyy')}
                    </div>
                    <button
                        type="button"
                        onClick={() => setVisibleMonth(prev => addMonths(prev, 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                        aria-label="Tháng sau"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
                <div className="mb-1 grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS.map((weekday) => (
                        <div
                            key={weekday}
                            className="flex h-7 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-slate-400"
                        >
                            {weekday}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                        const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                        const isToday = isSameDay(day, today);
                        const isCurrentMonth = isSameMonth(day, visibleMonth);

                        return (
                            <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => handleSelectDay(day)}
                                className={[
                                    'flex h-8 items-center justify-center rounded-lg text-sm transition-colors',
                                    isSelected
                                        ? 'bg-blue-600 font-semibold text-white shadow-sm'
                                        : isCurrentMonth
                                            ? 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                                            : 'text-slate-300 hover:bg-slate-200',
                                    isToday && !isSelected ? 'ring-1 ring-blue-300' : '',
                                ].filter(Boolean).join(' ')}
                                aria-label={format(day, 'dd/MM/yyyy')}
                            >
                                {format(day, 'd')}
                            </button>
                        );
                    })}
                </div>
            </div>
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
