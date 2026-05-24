'use client';

import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import type { ReportListItem, ReportErrorBody } from '@/types/report';

interface Props {
    onClose: () => void;
    onUploaded: (report: ReportListItem) => void;
    onError: (message: string) => void;
}

export default function UploadReportDialog({ onClose, onUploaded, onError }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!file) return;
        setSubmitting(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/reports', { method: 'POST', body: form });
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
            <div role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title" className="bg-white rounded-lg shadow-xl w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div id="upload-dialog-title" className="font-semibold text-gray-800">Upload weekly report</div>
                    <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-4 space-y-3">
                    <label className="block text-sm">
                        <span className="text-gray-600">.docx file</span>
                        <input
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="block w-full mt-1 text-sm"
                        />
                    </label>
                    {file && (
                        <div className="text-xs text-gray-500">
                            {file.name} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm rounded hover:bg-gray-100">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!file || submitting}
                        className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:bg-gray-300 flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload
                    </button>
                </div>
            </div>
        </div>
    );
}
