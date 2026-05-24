'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Upload, Download, Trash2, Loader2, FileText } from 'lucide-react';
import type { ReportListItem } from '@/types/report';
import UploadReportDialog from './UploadReportDialog';

interface Props {
    canEdit: boolean;
    onSelect: (reportId: string) => void;
    onClose: () => void;
    onToast?: (message: string, kind?: 'success' | 'error') => void;
}

const todayMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ReportsPanel({ canEdit, onSelect, onClose, onToast }: Props) {
    const [months, setMonths] = useState<string[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string>(todayMonth());
    const [reports, setReports] = useState<ReportListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);

    const loadMonths = useCallback(async () => {
        try {
            const res = await fetch('/api/reports/months');
            const data = (await res.json()) as { months: string[] };
            setMonths(data.months);
            if (data.months.length && !data.months.includes(selectedMonth)) {
                setSelectedMonth(data.months[0]);
            }
        } catch {
            onToast?.('Failed to load months', 'error');
        }
    }, [onToast, selectedMonth]);

    const loadReports = useCallback(async (month: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports?month=${encodeURIComponent(month)}`);
            const data = (await res.json()) as { reports: ReportListItem[] };
            setReports(data.reports);
        } catch {
            onToast?.('Failed to load reports', 'error');
        } finally {
            setLoading(false);
        }
    }, [onToast]);

    useEffect(() => { void loadMonths(); }, [loadMonths]);
    useEffect(() => { void loadReports(selectedMonth); }, [loadReports, selectedMonth]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this report?')) return;
        try {
            const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                onToast?.(body.error || 'Delete failed', 'error');
                return;
            }
            onToast?.('Report deleted', 'success');
            await loadMonths();
            await loadReports(selectedMonth);
        } catch {
            onToast?.('Delete failed', 'error');
        }
    };

    const handleDownload = async (id: string) => {
        try {
            const res = await fetch(`/api/reports/${id}/download`);
            if (!res.ok) {
                onToast?.('Download failed', 'error');
                return;
            }
            const data = (await res.json()) as { url: string };
            window.open(data.url, '_blank');
        } catch {
            onToast?.('Download failed', 'error');
        }
    };

    return (
        <aside className="fixed top-0 right-0 h-full w-[360px] bg-white border-l border-gray-200 shadow-lg flex flex-col z-40">
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2 text-gray-800 font-semibold">
                    <FileText className="w-4 h-4" /> Reports
                </div>
                <button onClick={onClose} aria-label="Close panel" className="p-1 rounded hover:bg-gray-100">
                    <X className="w-4 h-4" />
                </button>
            </header>

            <div className="px-4 py-3 border-b border-gray-200 space-y-2">
                <label className="block text-xs text-gray-500">Month</label>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                    {months.length === 0 && <option value={selectedMonth}>{selectedMonth}</option>}
                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            {canEdit && (
                <div className="px-4 py-3 border-b border-gray-200">
                    <button
                        onClick={() => setShowUpload(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        <Upload className="w-4 h-4" /> Upload .docx
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-auto">
                {loading && (
                    <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                )}
                {!loading && reports.length === 0 && (
                    <div className="p-4 text-sm text-gray-500">Chưa có report nào trong tháng này.</div>
                )}
                {!loading && reports.map((r) => (
                    <div key={r.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <button
                            onClick={() => onSelect(r.id)}
                            className="block w-full text-left"
                        >
                            <div className="text-sm font-medium text-gray-800">{r.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {r.sprintNumber ? `Sprint ${r.sprintNumber} · ` : ''}
                                {r.reportDate}
                                {r.uploadedBy ? ` · ${r.uploadedBy}` : ''}
                            </div>
                        </button>
                        <div className="flex gap-3 mt-2 text-xs">
                            <button onClick={() => handleDownload(r.id)} className="text-blue-600 hover:underline flex items-center gap-1">
                                <Download className="w-3 h-3" /> Download
                            </button>
                            {canEdit && (
                                <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline flex items-center gap-1">
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showUpload && (
                <UploadReportDialog
                    onClose={() => setShowUpload(false)}
                    onUploaded={() => { void loadMonths(); void loadReports(selectedMonth); onToast?.('Report uploaded', 'success'); }}
                    onError={(msg) => onToast?.(msg, 'error')}
                />
            )}
        </aside>
    );
}
