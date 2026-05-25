'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Download, GripHorizontal, Pencil } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useResizable, type ResizeDirection } from '@/hooks/useResizable';
import { usePersistedWindow } from '@/hooks/usePersistedWindow';
import ReportEditMetaForm, { type MetaErrors } from './ReportEditMetaForm';
import ReportEditBody from './ReportEditBody';
import { buildPatchPayload } from '@/utils/buildPatchPayload';
import type { Report, MetaDraft, ReportErrorBody } from '@/types/report';

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
    canEdit: boolean;
    onClose: () => void;
    onDownload: () => void;
    onSaved?: (updated: Report) => void;
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

export default function ReportPopup({ report, canEdit, onClose, onDownload, onSaved }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const { state, setPosition, setBounds } = usePersistedWindow(STORAGE_KEY, DEFAULTS);

    useDraggable({ elementRef: containerRef, handleRef: headerRef, onChange: setPosition });

    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [localReport, setLocalReport] = useState(report);
    const [draftMeta, setDraftMeta] = useState<MetaDraft>({
        title: report.title,
        weekLabel: report.weekLabel ?? '',
        dateRange: report.dateRange ?? '',
        sprintNumber: report.sprintNumber,
        reportDate: report.reportDate,
    });
    const [draftHtml, setDraftHtml] = useState(report.htmlContent);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<MetaErrors>({});

    useEffect(() => {
        setLocalReport(report);
        setDraftMeta({
            title: report.title,
            weekLabel: report.weekLabel ?? '',
            dateRange: report.dateRange ?? '',
            sprintNumber: report.sprintNumber,
            reportDate: report.reportDate,
        });
        setDraftHtml(report.htmlContent);
        setMode('view');
        setErrors({});
        // Reset only when a different report opens, not on same-report data updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [report.id]);

    const dirty = useMemo(() => {
        return Object.keys(buildPatchPayload(localReport, draftMeta, draftHtml)).length > 0;
    }, [localReport, draftMeta, draftHtml]);

    const validate = useCallback((draft: MetaDraft): MetaErrors => {
        const e: MetaErrors = {};
        if (!draft.title.trim()) e.title = 'Required';
        if (draft.sprintNumber !== null && (!Number.isFinite(draft.sprintNumber) || draft.sprintNumber < 0)) {
            e.sprintNumber = 'Must be a non-negative number';
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reportDate)) {
            e.reportDate = 'Format YYYY-MM-DD';
        }
        return e;
    }, []);

    const handleSave = useCallback(async () => {
        const e = validate(draftMeta);
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }
        setErrors({});
        const patch = buildPatchPayload(localReport, draftMeta, draftHtml);
        if (Object.keys(patch).length === 0) {
            setMode('view');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/reports/${localReport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
                alert(body.error || `Save failed (${res.status})`);
                return;
            }
            const data = (await res.json()) as { report: Report };
            setLocalReport(data.report);
            setDraftMeta({
                title: data.report.title,
                weekLabel: data.report.weekLabel ?? '',
                dateRange: data.report.dateRange ?? '',
                sprintNumber: data.report.sprintNumber,
                reportDate: data.report.reportDate,
            });
            setDraftHtml(data.report.htmlContent);
            setMode('view');
            onSaved?.(data.report);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }, [draftMeta, draftHtml, localReport, validate, onSaved]);

    const handleCancel = useCallback(() => {
        if (dirty && !confirm('Hủy thay đổi chưa lưu?')) return;
        setDraftMeta({
            title: localReport.title,
            weekLabel: localReport.weekLabel ?? '',
            dateRange: localReport.dateRange ?? '',
            sprintNumber: localReport.sprintNumber,
            reportDate: localReport.reportDate,
        });
        setDraftHtml(localReport.htmlContent);
        setErrors({});
        setMode('view');
    }, [dirty, localReport]);

    const handleReplaceClick = () => fileInputRef.current?.click();

    const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting same file later
        if (!file) return;
        setSaving(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`/api/reports/${localReport.id}/file`, { method: 'PUT', body: form });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
                alert(body.error || `Replace failed (${res.status})`);
                return;
            }
            const data = (await res.json()) as { report: Report };
            setLocalReport(data.report);
            setDraftMeta({
                title: data.report.title,
                weekLabel: data.report.weekLabel ?? '',
                dateRange: data.report.dateRange ?? '',
                sprintNumber: data.report.sprintNumber,
                reportDate: data.report.reportDate,
            });
            setDraftHtml(data.report.htmlContent);
            // Stay in edit mode so user can review.
            onSaved?.(data.report);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Replace failed');
        } finally {
            setSaving(false);
        }
    }, [localReport.id, onSaved]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (mode === 'view') {
                onClose();
            } else {
                handleCancel();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mode, onClose, handleCancel]);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={localReport.title}
            tabIndex={-1}
            className="fixed bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col"
            style={{ left: state.x, top: state.y, width: state.width, height: state.height, zIndex: 60 }}
        >
            <div
                ref={headerRef}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none rounded-t-lg"
            >
                <GripHorizontal className="w-4 h-4 text-gray-400" aria-hidden />
                {mode === 'view' ? (
                    <div className="flex-1 truncate text-sm font-semibold text-gray-800">{localReport.title}</div>
                ) : (
                    <input
                        type="text"
                        value={draftMeta.title}
                        onChange={(e) => setDraftMeta({ ...draftMeta, title: e.target.value })}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label="Title"
                        className="flex-1 px-2 py-0.5 text-sm font-semibold border border-gray-300 rounded"
                    />
                )}
                {canEdit && mode === 'view' && (
                    <button onClick={() => setMode('edit')} aria-label="Edit" title="Edit" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                        <Pencil className="w-4 h-4" />
                    </button>
                )}
                <button onClick={onDownload} aria-label="Download original .docx" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                    <Download className="w-4 h-4" />
                </button>
                <button onClick={mode === 'view' ? onClose : handleCancel} aria-label="Close" className="p-1 rounded hover:bg-gray-200 text-gray-600">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {mode === 'edit' && (
                <ReportEditMetaForm value={draftMeta} onChange={setDraftMeta} errors={errors} />
            )}

            {mode === 'view' ? (
                <div
                    className="flex-1 overflow-auto p-4 report-prose text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: localReport.htmlContent }}
                />
            ) : (
                <ReportEditBody initialHtml={localReport.htmlContent} onChange={setDraftHtml} />
            )}

            {mode === 'edit' && (
                <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50/50" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={handleReplaceClick}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
                    >
                        ⬆ Replace .docx
                    </button>
                    <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileSelected} className="hidden" />
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded hover:bg-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:bg-gray-300"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            )}

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
