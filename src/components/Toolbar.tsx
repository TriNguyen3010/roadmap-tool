'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Save, GitBranch, Download, Loader2, Flag, Check,
    Pencil, Clock, Settings, X, ChevronRight, Upload,
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
    onGitPush: () => void;
    onExportExcel?: () => void;
    onOpenMilestones: () => void;
    beforeWeeks: number;
    afterMonths: number;
    onBeforeWeeksChange: (w: number) => void;
    onAfterMonthsChange: (m: number) => void;
    onLoadJson?: (jsonData: any) => void;
    isSaving?: boolean;
}

export default function Toolbar({
    documentName, onNameChange, onSave, onGitPush, onExportExcel,
    onOpenMilestones, beforeWeeks, afterMonths,
    onBeforeWeeksChange, onAfterMonthsChange, onLoadJson, isSaving,
}: ToolbarProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(documentName);
    const [now, setNow] = useState<Date | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setNow(new Date());
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Close settings on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setSettingsOpen(false);
            }
        };
        if (settingsOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [settingsOpen]);

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
            } catch (error) {
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

                {/* ⚙ Settings — icon only, opens dropdown */}
                <div className="relative" ref={settingsRef}>
                    <button
                        onClick={() => setSettingsOpen(p => !p)}
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
                                    onClick={() => { onGitPush(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <GitBranch size={13} />
                                    <span>Git Push</span>
                                </button>

                                <button
                                    onClick={() => { onExportExcel?.(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <Download size={13} />
                                    <span>Xuất Excel</span>
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
