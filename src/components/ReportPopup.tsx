'use client';

import { useEffect, useRef } from 'react';
import { X, Download, GripHorizontal } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useResizable, type ResizeDirection } from '@/hooks/useResizable';
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
const MAX = { width: 9999, height: 9999 };

// Resize handle geometry. Edges sit just outside the popup border so the cursor
// changes when you approach the edge from outside too; corners overlap.
const HANDLES: Array<{ dir: ResizeDirection; className: string; cursor: string }> = [
    // edges
    { dir: 'n', className: 'absolute left-2 right-2 -top-1 h-2',          cursor: 'cursor-n-resize' },
    { dir: 's', className: 'absolute left-2 right-2 -bottom-1 h-2',       cursor: 'cursor-s-resize' },
    { dir: 'w', className: 'absolute top-2 bottom-2 -left-1 w-2',         cursor: 'cursor-w-resize' },
    { dir: 'e', className: 'absolute top-2 bottom-2 -right-1 w-2',        cursor: 'cursor-e-resize' },
    // corners (slightly larger hit area; sit above edges)
    { dir: 'nw', className: 'absolute -top-1 -left-1 w-3 h-3',            cursor: 'cursor-nw-resize' },
    { dir: 'ne', className: 'absolute -top-1 -right-1 w-3 h-3',           cursor: 'cursor-ne-resize' },
    { dir: 'sw', className: 'absolute -bottom-1 -left-1 w-3 h-3',         cursor: 'cursor-sw-resize' },
    { dir: 'se', className: 'absolute -bottom-1 -right-1 w-3 h-3',        cursor: 'cursor-se-resize' },
];

interface Props {
    report: Report;
    onClose: () => void;
    onDownload: () => void;
}

function ResizeHandle({
    containerRef,
    dir,
    className,
    cursor,
    onResize,
    showSeMarker,
}: {
    containerRef: React.RefObject<HTMLDivElement | null>;
    dir: ResizeDirection;
    className: string;
    cursor: string;
    onResize: (bounds: { x: number; y: number; width: number; height: number }) => void;
    showSeMarker: boolean;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    useResizable({
        elementRef: containerRef,
        handleRef: ref,
        direction: dir,
        onResize,
        min: MIN,
        max: MAX,
    });
    return (
        <div
            ref={ref}
            role="presentation"
            aria-hidden="true"
            className={`${className} ${cursor} z-10`}
            style={
                showSeMarker
                    ? {
                          background:
                              'linear-gradient(135deg, transparent 50%, #94a3b8 50%, #94a3b8 60%, transparent 60%, transparent 70%, #94a3b8 70%, #94a3b8 80%, transparent 80%)',
                      }
                    : undefined
            }
        />
    );
}

export default function ReportPopup({ report, onClose, onDownload }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);

    const { state, setPosition, setBounds } = usePersistedWindow(STORAGE_KEY, DEFAULTS);

    useDraggable({ elementRef: containerRef, handleRef: headerRef, onChange: setPosition });

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
            className="fixed bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col"
            style={{
                left: state.x,
                top: state.y,
                width: state.width,
                height: state.height,
                zIndex: 60,
            }}
        >
            <div
                ref={headerRef}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none rounded-t-lg"
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
            {HANDLES.map((h) => (
                <ResizeHandle
                    key={h.dir}
                    containerRef={containerRef}
                    dir={h.dir}
                    className={h.className}
                    cursor={h.cursor}
                    onResize={setBounds}
                    showSeMarker={h.dir === 'se'}
                />
            ))}
        </div>
    );
}
