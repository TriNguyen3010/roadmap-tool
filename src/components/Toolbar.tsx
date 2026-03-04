'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Save, Download, FileJson, Loader2, Flag, Check,
    Pencil, Clock, Settings, X, ChevronRight, Upload, Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

// ── Before options: weeks (negative offset from today)
export const BEFORE_OPTIONS: { label: string; weeks: number }[] = [
    { label: '2T', weeks: 2 },
    { label: '1Th', weeks: 4 },
    { label: '2Th', weeks: 8 },
];

// ── After options: months
export const AFTER_OPTIONS: { label: string; months: number }[] = [
    { label: '1Th', months: 1 },
    { label: '2Th', months: 2 },
    { label: '3Th', months: 3 },
    { label: '4Th', months: 4 },
    { label: '6Th', months: 6 },
    { label: '9Th', months: 9 },
    { label: '12Th', months: 12 },
];

interface ToolbarProps {
    documentName: string;
    onNameChange: (name: string) => void;
    onSave: () => void;
    onExportExcel?: () => void;
    onOpenMilestones: () => void;
    beforeWeeks: number;
    afterMonths: number;
    onBeforeWeeksChange: (w: number) => void;
    onAfterMonthsChange: (m: number) => void;
    onLoadJson?: (jsonData: unknown) => void;
    onDownloadJson?: () => void;
    isSaving?: boolean;
    // View Filter props
    availableTeams: string[];
    availableSubcategories: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterSubcategory: string[];
    onFilterChange: (type: 'status' | 'team' | 'priority' | 'subcategory', values: string[]) => void;
    onSaveView: () => void;
}

export default function Toolbar({
    documentName, onNameChange, onSave, onExportExcel,
    onOpenMilestones, beforeWeeks, afterMonths,
    onBeforeWeeksChange, onAfterMonthsChange, onLoadJson, onDownloadJson, isSaving,
    availableTeams, availableSubcategories, filterStatus, filterTeam, filterPriority, filterSubcategory, onFilterChange, onSaveView
}: ToolbarProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(documentName);
    const [now, setNow] = useState<Date>(new Date());
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [viewOpen, setViewOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Close settings on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setSettingsOpen(false);
            }
            if (viewRef.current && !viewRef.current.contains(e.target as Node)) {
                setViewOpen(false);
            }
        };
        if (settingsOpen || viewOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [settingsOpen, viewOpen]);

    const toggleStatus = (st: string) => {
        if (filterStatus.includes(st)) onFilterChange('status', filterStatus.filter(s => s !== st));
        else onFilterChange('status', [...filterStatus, st]);
    };

    const toggleTeam = (tm: string) => {
        if (filterTeam.includes(tm)) onFilterChange('team', filterTeam.filter(t => t !== tm));
        else onFilterChange('team', [...filterTeam, tm]);
    };

    const togglePriority = (p: string) => {
        if (filterPriority.includes(p)) onFilterChange('priority', filterPriority.filter(x => x !== p));
        else onFilterChange('priority', [...filterPriority, p]);
    };

    const toggleSubcategory = (subcategory: string) => {
        if (filterSubcategory.includes(subcategory)) onFilterChange('subcategory', filterSubcategory.filter(x => x !== subcategory));
        else onFilterChange('subcategory', [...filterSubcategory, subcategory]);
    };

    const startEdit = () => {
        setDraft(documentName);
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 50);
    };

    const commitEdit = () => {
        if (draft.trim()) onNameChange(draft.trim());
        setEditing(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string);
                onLoadJson?.(parsed);
                setSettingsOpen(false);
            } catch {
                alert("File JSON không hợp lệ!");
            }
        };
        reader.readAsText(file);
        // Reset input to allow selecting the same file again
        e.target.value = '';
    };

    return (
        <div className="flex flex-row items-center justify-between border-b-2 border-gray-400 px-3 py-1 bg-gray-100 shrink-0 gap-2">
            <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

            {/* LEFT: logo + doc name */}
            <div className="flex items-center gap-2 min-w-0" style={{ flex: '0 0 auto', maxWidth: 280 }}>
                <span className="text-base shrink-0">📋</span>
                {editing ? (
                    <div className="flex items-center gap-1 flex-1">
                        <input
                            ref={inputRef}
                            autoFocus
                            className="flex-1 border border-blue-400 rounded px-2 py-0.5 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-0"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                            onBlur={commitEdit}
                        />
                        <button onClick={commitEdit} className="text-green-600 hover:text-green-800 shrink-0">
                            <Check size={15} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 group cursor-pointer min-w-0" onClick={startEdit}>
                        <span className="font-bold text-gray-800 text-sm truncate">{documentName}</span>
                        <Pencil size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                )}
            </div>

            {/* CENTER: Live clock */}
            {now && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-600 bg-white border border-gray-300 rounded-full px-3 py-0.5 shrink-0 font-mono shadow-sm select-none">
                    <Clock size={11} className="text-blue-500 shrink-0" />
                    <span className="font-semibold text-gray-700">
                        {format(now, 'EEEE', { locale: vi }).charAt(0).toUpperCase() + format(now, 'EEEE', { locale: vi }).slice(1)}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span>{format(now, 'dd/MM/yyyy')}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-blue-600 font-bold tabular-nums">{format(now, 'HH:mm:ss')}</span>
                </div>
            )}

            {/* RIGHT: action buttons */}
            <div className="flex flex-row items-center gap-1.5 shrink-0 ml-auto">

                {/* Milestones */}
                <button
                    onClick={onOpenMilestones}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold transition-colors"
                    title="Milestones"
                >
                    <Flag size={13} />
                    <span>Milestones</span>
                </button>

                {/* Save — icon only */}
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    title={isSaving ? 'Đang lưu...' : 'Lưu JSON'}
                    className="flex items-center justify-center w-8 h-8 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white transition-colors shadow-sm"
                >
                    {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                </button>

                {/* 👁 View Mode Dropdown */}
                <div className="relative" ref={viewRef}>
                    <button
                        onClick={() => { setViewOpen(p => !p); setSettingsOpen(false); }}
                        title="Chế độ xem (Filters)"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors shadow-sm text-white ${viewOpen || filterStatus.length > 0 || filterTeam.length > 0 || filterPriority.length > 0 || filterSubcategory.length > 0 ? 'bg-indigo-700 font-bold' : 'bg-indigo-500 hover:bg-indigo-600 font-semibold'} text-xs`}
                    >
                        <Filter size={13} />
                        <span>Filter{(filterStatus.length > 0 || filterTeam.length > 0 || filterPriority.length > 0 || filterSubcategory.length > 0) ? ` (${filterStatus.length + filterTeam.length + filterPriority.length + filterSubcategory.length})` : ''}</span>
                    </button>

                    {viewOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-600 text-white shadow-sm z-10">
                                <span className="text-sm font-bold truncate">Bộ lọc hiển thị</span>
                                <button onClick={() => setViewOpen(false)} className="hover:bg-white/20 rounded p-0.5 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
                                {/* Status filters */}
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Trạng thái (Status)</p>
                                    <div className="flex flex-col gap-2">
                                        {['Done', 'In Progress', 'Not Started'].map(st => (
                                            <label key={st} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={filterStatus.includes(st)}
                                                    onChange={() => toggleStatus(st)}
                                                    className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{st}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Priority filters */}
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 border-t border-gray-100 pt-3">Mức ưu tiên (Priority)</p>
                                    <div className="flex flex-col gap-2">
                                        {['High', 'Medium', 'Low'].map(p => (
                                            <label key={p} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={filterPriority.includes(p)}
                                                    onChange={() => togglePriority(p)}
                                                    className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{p}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Team filters */}
                                {availableTeams.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2 border-t border-gray-100 pt-3">Đội ngũ (Teams)</p>
                                        <div className="flex flex-col gap-2">
                                            {availableTeams.map(tm => (
                                                <label key={tm} className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterTeam.includes(tm)}
                                                        onChange={() => toggleTeam(tm)}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{tm}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Subcategory filters */}
                                {availableSubcategories.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2 border-t border-gray-100 pt-3">Subcategory</p>
                                        <div className="flex flex-col gap-2">
                                            {availableSubcategories.map(sub => (
                                                <label key={sub} className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterSubcategory.includes(sub)}
                                                        onChange={() => toggleSubcategory(sub)}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs text-gray-700 font-medium group-hover:text-indigo-700">{sub}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2">
                                <button
                                    onClick={() => { onFilterChange('status', []); onFilterChange('team', []); onFilterChange('priority', []); onFilterChange('subcategory', []); }}
                                    disabled={filterStatus.length === 0 && filterTeam.length === 0 && filterPriority.length === 0 && filterSubcategory.length === 0}
                                    className="w-full text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50 text-gray-600 border border-gray-300 hover:bg-gray-100"
                                >
                                    Xóa bộ lọc (Show All)
                                </button>
                                <button
                                    onClick={() => { onSaveView(); setViewOpen(false); }}
                                    className="w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition-colors text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
                                >
                                    <Save size={12} />
                                    <span>Lưu View (Mặc định)</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ⚙ Settings — icon only, opens dropdown */}
                <div className="relative" ref={settingsRef}>
                    <button
                        onClick={() => { setSettingsOpen(p => !p); setViewOpen(false); }}
                        title="Cài đặt"
                        className={`flex items-center justify-center w-8 h-8 rounded transition-colors shadow-sm text-white ${settingsOpen ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                    >
                        <Settings size={15} className={settingsOpen ? 'animate-spin-slow' : ''} />
                    </button>

                    {/* Settings Dropdown Panel */}
                    {settingsOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-600 text-white">
                                <div className="flex items-center gap-1.5 text-sm font-bold">
                                    <Settings size={13} />
                                    <span>Cài đặt</span>
                                </div>
                                <button onClick={() => setSettingsOpen(false)} className="hover:bg-white/20 rounded p-0.5 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* ── Timeline section ── */}
                            <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Phạm vi Timeline</p>

                                {/* Before current date */}
                                <div className="mb-2.5">
                                    <div className="flex items-center gap-1 mb-1">
                                        <ChevronRight size={10} className="text-gray-400 rotate-180" />
                                        <span className="text-[11px] text-gray-500 font-semibold">Trước hiện tại</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {BEFORE_OPTIONS.map(opt => (
                                            <button
                                                key={opt.weeks}
                                                onClick={() => onBeforeWeeksChange(opt.weeks)}
                                                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors border ${beforeWeeks === opt.weeks
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* After current date */}
                                <div>
                                    <div className="flex items-center gap-1 mb-1">
                                        <ChevronRight size={10} className="text-gray-400" />
                                        <span className="text-[11px] text-gray-500 font-semibold">Sau hiện tại</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {AFTER_OPTIONS.map(opt => (
                                            <button
                                                key={opt.months}
                                                onClick={() => onAfterMonthsChange(opt.months)}
                                                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors border ${afterMonths === opt.months
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ── Actions section ── */}
                            <div className="px-4 py-3 flex flex-col gap-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Hành động</p>

                                <button
                                    onClick={() => { onExportExcel?.(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <Download size={13} />
                                    <span>Xuất Excel</span>
                                </button>

                                <button
                                    onClick={() => { onDownloadJson?.(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <FileJson size={13} />
                                    <span>Tải xuống JSON</span>
                                </button>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <Upload size={13} />
                                    <span>Tải lên JSON</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
