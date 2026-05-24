'use client';

import { useEffect, useRef } from 'react';
import { X, Download, GripHorizontal } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useResizable } from '@/hooks/useResizable';
import { usePersistedWindow } from '@/hooks/usePersistedWindow';
import type { Report } from '@/types/report';

const STORAGE_KEY = 'report-popup-window';
const computeCenteredDefaults = () => {
    if (typeof window === 'undefined') return { x: 120, y: 80, width: 720, height: 560 };
    const width = Math.min(720, window.innerWidth - 80);
    const height = Math.min(560, window.innerHeight - 80);
    return {
        x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
        width,
        height,
    };
};
const DEFAULTS = computeCenteredDefaults();
const MIN = { width: 320, height: 240 };

interface Props {
    report: Report;
    onClose: () => void;
    onDownload: () => void;
}

export default function ReportPopup({ report, onClose, onDownload }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const handleRef = useRef<HTMLDivElement | null>(null);
    const resizeRef = useRef<HTMLDivElement | null>(null);

    const { state, setPosition, setSize } = usePersistedWindow(STORAGE_KEY, DEFAULTS);

    useDraggable({ elementRef: containerRef, handleRef, onChange: setPosition });
    useResizable({
        elementRef: containerRef,
        handleRef: resizeRef,
        onChange: setSize,
        min: MIN,
        max: { width: 9999, height: 9999 },
    });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={report.title}
            tabIndex={-1}
            className="fixed bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col overflow-hidden"
            style={{
                left: state.x,
                top: state.y,
                width: state.width,
                height: state.height,
                zIndex: 60,
            }}
        >
            <div
                ref={handleRef}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none"
            >
                <GripHorizontal className="w-4 h-4 text-gray-400" aria-hidden />
                <div className="flex-1 truncate text-sm font-semibold text-gray-800">{report.title}</div>
                <button
                    onClick={onDownload}
                    aria-label="Download original .docx"
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                >
                    <Download className="w-4 h-4" />
                </button>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="p-1 rounded hover:bg-gray-200 text-gray-600"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div
                className="flex-1 overflow-auto p-4 report-prose text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: report.htmlContent }}
            />
            <div
                ref={resizeRef}
                role="presentation"
                aria-hidden="true"
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                style={{
                    background:
                        'linear-gradient(135deg, transparent 50%, #94a3b8 50%, #94a3b8 60%, transparent 60%, transparent 70%, #94a3b8 70%, #94a3b8 80%, transparent 80%)',
                }}
            />
        </div>
    );
}
