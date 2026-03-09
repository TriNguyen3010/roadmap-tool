'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Save, Download, FileJson, Loader2, Flag, Check,
    Pencil, Clock, Settings, X, ChevronRight, Upload, Filter, Lock, Unlock
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import SidePanelShell from './SidePanelShell';

export type QuickViewMode = 'feature' | 'improvement' | 'bug' | 'web' | 'app' | 'reported';

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
    onOpenMilestonesPopup: () => void;
    onOpenFilterPopup: () => void;
    isFilterPopupOpen?: boolean;
    isMilestonesPopupOpen?: boolean;
    beforeWeeks: number;
    afterMonths: number;
    onBeforeWeeksChange: (w: number) => void;
    onAfterMonthsChange: (m: number) => void;
    onLoadJson?: (jsonData: unknown) => void;
    onDownloadJson?: () => void;
    isSaving?: boolean;
    canEdit: boolean;
    authLoading?: boolean;
    onUnlockEditor: (password: string) => Promise<{ success: boolean; message?: string }>;
    onLockEditor: () => Promise<void> | void;
    filterCategory: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterPhase: string[];
    filterSubcategory: string[];
    filterGroupItemType: string[];
    onToggleQuickViewMode: (mode: QuickViewMode) => void;
}

export default function Toolbar({
    documentName, onNameChange, onSave, onExportExcel,
    onOpenMilestonesPopup, onOpenFilterPopup, isFilterPopupOpen, isMilestonesPopupOpen, beforeWeeks, afterMonths,
    onBeforeWeeksChange, onAfterMonthsChange, onLoadJson, onDownloadJson, isSaving,
    canEdit, authLoading, onUnlockEditor, onLockEditor,
    filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType, onToggleQuickViewMode
}: ToolbarProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(documentName);
    const [now, setNow] = useState<Date>(new Date());
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [authSubmitting, setAuthSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
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
        };
        if (settingsOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [settingsOpen]);

    useEffect(() => {
        if (!authOpen) return;
        const timer = setTimeout(() => passwordRef.current?.focus(), 20);
        return () => clearTimeout(timer);
    }, [authOpen]);

    const activeFilterCount = (
        filterCategory.length
        + filterStatus.length
        + filterTeam.length
        + filterPriority.length
        + filterPhase.length
        + filterSubcategory.length
        + filterGroupItemType.length
    );
    const hasSubcategoryQuick = (value: string) => filterSubcategory.includes(value) && filterSubcategory.includes('Core');
    const quickViewButtons: { mode: QuickViewMode; label: string; active: boolean }[] = [
        { mode: 'feature', label: 'Feature', active: filterGroupItemType.includes('Feature') },
        { mode: 'improvement', label: 'Improvement', active: filterGroupItemType.includes('Improvement') },
        { mode: 'bug', label: 'Bug', active: filterGroupItemType.includes('Bug') },
        { mode: 'web', label: 'Web', active: hasSubcategoryQuick('Web') },
        { mode: 'app', label: 'App', active: hasSubcategoryQuick('App') },
        { mode: 'reported', label: 'Reported', active: filterPriority.includes('Reported') },
    ];

    const startEdit = () => {
        if (!canEdit) return;
        setDraft(documentName);
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 50);
    };

    const commitEdit = () => {
        if (!canEdit) {
            setEditing(false);
            return;
        }
        if (draft.trim()) onNameChange(draft.trim());
        setEditing(false);
    };

    const handleUnlockSubmit = async () => {
        if (!password || authSubmitting) return;
        setAuthSubmitting(true);
        setAuthError('');
        const result = await onUnlockEditor(password);
        setAuthSubmitting(false);
        if (!result.success) {
            setAuthError(result.message || 'Mật khẩu không đúng');
            return;
        }
        setPassword('');
        setAuthOpen(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return;
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

    const isEditingName = canEdit && editing;

    return (
        <div className="relative flex flex-row items-center justify-between border-b-2 border-gray-400 px-3 py-1 bg-gray-100 shrink-0 gap-2">
            <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

            {authOpen && (
                <SidePanelShell
                    isOpen={authOpen}
                    onClose={() => setAuthOpen(false)}
                    title="Unlock Editor"
                    subtitle="Nhập mật khẩu để bật chế độ chỉnh sửa"
                    widthClassName="w-[360px]"
                    footer={(
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setAuthOpen(false)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleUnlockSubmit()}
                                disabled={authSubmitting || !password}
                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                            >
                                {authSubmitting ? 'Checking...' : 'Unlock'}
                            </button>
                        </div>
                    )}
                >
                    <input
                        ref={passwordRef}
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void handleUnlockSubmit()}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Editor password"
                    />
                    {authError && <p className="mt-2 text-xs text-red-600">{authError}</p>}
                </SidePanelShell>
            )}

            {/* LEFT: logo + doc name + quick view */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0 shrink-0" style={{ maxWidth: 300 }}>
                    <span className="text-base shrink-0">📋</span>
                    {isEditingName ? (
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
                        <div className={`flex items-center gap-1 min-w-0 ${canEdit ? 'group cursor-pointer' : 'cursor-default'}`} onClick={startEdit}>
                            <span className="font-bold text-gray-800 text-sm truncate">{documentName}</span>
                            {canEdit && <Pencil size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-1 min-w-0 overflow-x-auto">
                    {quickViewButtons.map(button => (
                        <button
                            key={button.mode}
                            onClick={() => onToggleQuickViewMode(button.mode)}
                            title="Quick filter: kết hợp AND với các filter khác"
                            className={`shrink-0 rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors ${button.active
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                        >
                            {button.label}
                        </button>
                    ))}
                </div>
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
                {canEdit ? (
                    <button
                        onClick={() => void onLockEditor()}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
                        title="Đang ở chế độ Editor. Click để khóa."
                    >
                        <Lock size={13} />
                        <span>Editor</span>
                    </button>
                ) : (
                    <button
                        onClick={() => { setAuthOpen(true); setSettingsOpen(false); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded text-xs font-semibold transition-colors"
                        title="Viewer mode. Unlock để chỉnh sửa."
                        disabled={!!authLoading}
                    >
                        {authLoading ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                        <span>Viewer</span>
                    </button>
                )}

                {/* Phases */}
                <button
                    onClick={() => canEdit && onOpenMilestonesPopup()}
                    disabled={!canEdit}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-white rounded text-xs font-semibold transition-colors disabled:bg-amber-300 ${isMilestonesPopupOpen ? 'bg-amber-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                    title={canEdit ? 'Mở side panel Phases' : 'Viewer mode: không thể chỉnh phase'}
                >
                    <Flag size={13} />
                    <span>Phases</span>
                </button>

                <button
                    onClick={() => { onOpenFilterPopup(); setSettingsOpen(false); }}
                    title="Mở side panel Filter"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors shadow-sm text-white text-xs ${isFilterPopupOpen ? 'bg-indigo-700 font-bold' : activeFilterCount > 0 ? 'bg-indigo-600 hover:bg-indigo-700 font-bold' : 'bg-indigo-500 hover:bg-indigo-600 font-semibold'}`}
                >
                    <Filter size={13} />
                    <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                </button>

                {/* Save — icon only */}
                <button
                    onClick={() => canEdit && onSave()}
                    disabled={isSaving || !canEdit}
                    title={!canEdit ? 'Viewer mode: cần Unlock Editor để lưu' : isSaving ? 'Đang lưu...' : 'Lưu JSON'}
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
                                    disabled={!canEdit}
                                    title={!canEdit ? 'Viewer mode: cần Unlock Editor để tải lên JSON' : 'Tải lên JSON'}
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
