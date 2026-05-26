'use client';

import { useCallback, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import type { ReportListItem, ReportErrorBody, ReportMetadata } from '@/types/report';
import { parseReportHeader } from '@/utils/parseReportHeader';

interface Props {
    onClose: () => void;
    onUploaded: (report: ReportListItem) => void;
    onError: (message: string) => void;
}

type FormState = {
    weekLabel: string;
    dateRange: string;
    sprintNumber: string;
    reportDate: string;
    title: string;
};

const EMPTY_FORM: FormState = {
    weekLabel: '',
    dateRange: '',
    sprintNumber: '',
    reportDate: '',
    title: '',
};

const metaToForm = (m: ReportMetadata): FormState => ({
    weekLabel: m.weekLabel ?? '',
    dateRange: m.dateRange ?? '',
    sprintNumber: m.sprintNumber == null ? '' : String(m.sprintNumber),
    reportDate: m.reportDate,
    title: m.title,
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function UploadReportDialog({ onClose, onUploaded, onError }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleFile = useCallback(async (picked: File | null) => {
        setFile(picked);
        setParseError(null);
        if (!picked) {
            setForm(EMPTY_FORM);
            return;
        }
        setParsing(true);
        try {
            // mammoth is heavy (~250 KB); only load it when the editor actually picks a file.
            const mammothModule = await import('mammoth');
            const mammoth = mammothModule.default ?? mammothModule;
            const arrayBuffer = await picked.arrayBuffer();
            const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });
            setForm(metaToForm(parseReportHeader(rawText)));
        } catch (e) {
            // Spec §7.3: if parsing fails entirely, fall back to manual entry.
            setParseError(
                e instanceof Error
                    ? `Couldn't auto-parse: ${e.message}. Please fill the fields manually.`
                    : "Couldn't auto-parse the file. Please fill the fields manually.",
            );
            setForm(EMPTY_FORM);
        } finally {
            setParsing(false);
        }
    }, []);

    const trimmedTitle = form.title.trim();
    const canSubmit =
        !!file &&
        !parsing &&
        !submitting &&
        ISO_DATE_RE.test(form.reportDate) &&
        trimmedTitle.length > 0;

    const handleSubmit = async () => {
        if (!file || !canSubmit) return;
        setSubmitting(true);
        try {
            const sprintRaw = form.sprintNumber.trim();
            const sprintNumber = sprintRaw === '' ? null : Number(sprintRaw);
            const weekLabel = form.weekLabel.trim();
            const dateRange = form.dateRange.trim();
            const metadata = {
                month: form.reportDate.slice(0, 7),
                reportDate: form.reportDate,
                sprintNumber: Number.isFinite(sprintNumber) ? sprintNumber : null,
                weekLabel: weekLabel === '' ? null : weekLabel,
                dateRange: dateRange === '' ? null : dateRange,
                title: trimmedTitle,
            };
            const fd = new FormData();
            fd.append('file', file);
            fd.append('metadata', JSON.stringify(metadata));
            const res = await fetch('/api/reports', { method: 'POST', body: fd });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as ReportErrorBody;
                onError(body.error || `Upload failed (${res.status})`);
                return;
            }
            const data = (await res.json()) as { report: ReportListItem };
            onUploaded(data.report);
            onClose();
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-dialog-title"
                className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div id="upload-dialog-title" className="font-semibold text-gray-800">Upload weekly report</div>
                    <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto">
                    <label className="block text-sm">
                        <span className="text-gray-600">.docx file</span>
                        <input
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => { void handleFile(e.target.files?.[0] ?? null); }}
                            disabled={parsing || submitting}
                            className="block w-full mt-1 text-sm"
                        />
                    </label>
                    {file && (
                        <div className="text-xs text-gray-500">
                            {file.name} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                    )}

                    {parsing && (
                        <div className="text-xs text-gray-600 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Reading file…
                        </div>
                    )}

                    {parseError && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                            {parseError}
                        </div>
                    )}

                    {file && !parsing && (
                        <fieldset className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100" disabled={submitting}>
                            <legend className="sr-only">Report metadata</legend>
                            <label className="block text-sm col-span-2">
                                <span className="text-gray-600">Title</span>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                                    placeholder="Week 21 · 18/05 - 22/05"
                                    required
                                    className="block w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-gray-600">Week label</span>
                                <input
                                    type="text"
                                    value={form.weekLabel}
                                    onChange={(e) => setForm((s) => ({ ...s, weekLabel: e.target.value }))}
                                    placeholder="Week 21"
                                    className="block w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-gray-600">Sprint #</span>
                                <input
                                    type="number"
                                    value={form.sprintNumber}
                                    onChange={(e) => setForm((s) => ({ ...s, sprintNumber: e.target.value }))}
                                    placeholder="77"
                                    min={0}
                                    className="block w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm col-span-2">
                                <span className="text-gray-600">Date range</span>
                                <input
                                    type="text"
                                    value={form.dateRange}
                                    onChange={(e) => setForm((s) => ({ ...s, dateRange: e.target.value }))}
                                    placeholder="18/05 - 22/05"
                                    className="block w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm col-span-2">
                                <span className="text-gray-600">Report date</span>
                                <input
                                    type="date"
                                    value={form.reportDate}
                                    onChange={(e) => setForm((s) => ({ ...s, reportDate: e.target.value }))}
                                    required
                                    className="block w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                        </fieldset>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm rounded hover:bg-gray-100">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:bg-gray-300 flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
