'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    Save, Download, FileJson, Loader2, Flag, Check,
    Pencil, Settings, X, ChevronRight, ChevronDown, Upload, Filter, Lock, Unlock
} from 'lucide-react';
import SidePanelShell from './SidePanelShell';
import { PhaseOption } from '@/types/roadmap';

export type QuickViewMode = 'web' | 'app' | 'reported';

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
    onExportExcelCurrentView?: () => void;
    onExportExcelFullData?: () => void;
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
    availablePhases: PhaseOption[];
    onPhaseFilterChange: (values: string[]) => void;
    onToggleQuickViewMode: (mode: QuickViewMode) => void;
    isReportedMode: boolean;
    onExitReportedMode: () => void;
}

export default function Toolbar({
    documentName, onNameChange, onSave, onExportExcelCurrentView, onExportExcelFullData,
    onOpenMilestonesPopup, onOpenFilterPopup, isFilterPopupOpen, isMilestonesPopupOpen, beforeWeeks, afterMonths,
    onBeforeWeeksChange, onAfterMonthsChange, onLoadJson, onDownloadJson, isSaving,
    canEdit, authLoading, onUnlockEditor, onLockEditor,
    filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType,
    availablePhases, onPhaseFilterChange, onToggleQuickViewMode,
    isReportedMode
}: ToolbarProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(documentName);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const [phasePickerOpen, setPhasePickerOpen] = useState(false);
    const [phaseSearch, setPhaseSearch] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [authSubmitting, setAuthSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const phasePickerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const closePhasePicker = useCallback(() => {
        setPhasePickerOpen(false);
        setPhaseSearch('');
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
        if (!phasePickerOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            if (phasePickerRef.current && !phasePickerRef.current.contains(e.target as Node)) {
                closePhasePicker();
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closePhasePicker();
        };
        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [phasePickerOpen, closePhasePicker]);

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
        { mode: 'web', label: 'Web', active: hasSubcategoryQuick('Web') },
        { mode: 'app', label: 'App', active: hasSubcategoryQuick('App') },
        { mode: 'reported', label: 'Reported', active: isReportedMode },
    ];
    const selectedPhaseSet = useMemo(() => new Set(filterPhase), [filterPhase]);
    const normalizedPhaseSearch = phaseSearch.trim().toLowerCase();
    const visiblePhases = useMemo(() => {
        if (!normalizedPhaseSearch) return availablePhases;
        return availablePhases.filter(phase => phase.label.toLowerCase().includes(normalizedPhaseSearch));
    }, [availablePhases, normalizedPhaseSearch]);
    const phaseButtonLabel = filterPhase.length > 0 ? `Phase (${filterPhase.length})` : 'Phase';

    const handleTogglePhase = (phaseId: string) => {
        const next = new Set(filterPhase);
        if (next.has(phaseId)) next.delete(phaseId);
        else next.add(phaseId);
        onPhaseFilterChange(Array.from(next));
    };

    const handleSelectAllPhases = () => {
        const base = new Set(filterPhase);
        (visiblePhases.length > 0 ? visiblePhases : availablePhases).forEach(phase => base.add(phase.id));
        onPhaseFilterChange(Array.from(base));
    };

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
        <div className="relative shrink-0 border-b border-slate-200 bg-slate-100 px-3 py-2">
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

            <div className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 text-xs font-bold tracking-[0.22em] text-slate-900">COIN98</span>

                    {isEditingName ? (
                        <div className="flex min-w-[140px] items-center gap-1">
                            <input
                                ref={inputRef}
                                autoFocus
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                                onBlur={commitEdit}
                            />
                            <button onClick={commitEdit} className="text-emerald-600 hover:text-emerald-800">
                                <Check size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className={`flex min-w-[100px] items-center gap-1 ${canEdit ? 'group cursor-pointer' : 'cursor-default'}`} onClick={startEdit}>
                            <span className="truncate text-sm font-semibold text-slate-600">{documentName || 'Roadmap'}</span>
                            {canEdit && <Pencil size={12} className="shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />}
                        </div>
                    )}

                    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {quickViewButtons.map(button => (
                            <button
                                key={button.mode}
                                onClick={() => onToggleQuickViewMode(button.mode)}
                                title="Quick filter: kết hợp AND với các filter khác"
                                className={`h-8 shrink-0 rounded-[9px] border px-3 text-xs font-semibold transition-colors ${button.mode === 'reported' ? 'max-w-[190px] truncate' : ''} ${button.active
                                    ? 'border-[#F0B90B] bg-[#F0B90B] text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
                                    }`}
                            >
                                {button.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative shrink-0" ref={phasePickerRef}>
                        <button
                            type="button"
                            title={availablePhases.length === 0 ? 'Chưa có phase, mở manage phases để tạo mới' : 'Lọc phase nhanh'}
                            onClick={() => {
                                if (phasePickerOpen) {
                                    closePhasePicker();
                                    return;
                                }
                                setSettingsOpen(false);
                                setPhasePickerOpen(true);
                            }}
                            className={`flex h-8 items-center gap-1 rounded-[9px] border px-3 text-xs font-semibold transition-colors ${phasePickerOpen || filterPhase.length > 0 || isMilestonesPopupOpen
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                                }`}
                        >
                            <Flag size={12} />
                            <span>{phaseButtonLabel}</span>
                            <ChevronDown size={11} className={`transition-transform ${phasePickerOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {phasePickerOpen && (
                            <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                                <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phase Filter</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!canEdit) return;
                                            onOpenMilestonesPopup();
                                            closePhasePicker();
                                        }}
                                        disabled={!canEdit}
                                        className="rounded border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Manage
                                    </button>
                                </div>
                                <input
                                    value={phaseSearch}
                                    onChange={e => setPhaseSearch(e.target.value)}
                                    placeholder="Search phase..."
                                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none"
                                />
                                <div className="mt-1.5 flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
                                    <button
                                        type="button"
                                        onClick={handleSelectAllPhases}
                                        disabled={availablePhases.length === 0}
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Select all
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onPhaseFilterChange([])}
                                        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div className="mt-1.5 max-h-56 overflow-y-auto">
                                    {visiblePhases.length === 0 ? (
                                        <p className="px-1 py-2 text-xs text-gray-400">
                                            {availablePhases.length === 0 ? 'Chưa có phase. Hãy mở Manage để tạo phase.' : 'Không tìm thấy phase phù hợp.'}
                                        </p>
                                    ) : (
                                        visiblePhases.map(phase => {
                                            const checked = selectedPhaseSet.has(phase.id);
                                            return (
                                                <div key={phase.id} className="flex items-center justify-between gap-1 rounded px-1 py-1 hover:bg-gray-50">
                                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleTogglePhase(phase.id)}
                                                            className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="truncate text-xs text-gray-700">{phase.label}</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => onPhaseFilterChange([phase.id])}
                                                        className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                                                    >
                                                        Only
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {canEdit ? (
                        <button
                            onClick={() => void onLockEditor()}
                            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-slate-800 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
                            title="Đang ở chế độ Editor. Click để khóa."
                        >
                            <Lock size={13} />
                            <span>Editor</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => { setAuthOpen(true); setSettingsOpen(false); closePhasePicker(); }}
                            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-slate-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                            title="Viewer mode. Unlock để chỉnh sửa."
                            disabled={!!authLoading}
                        >
                            {authLoading ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                            <span>Viewer</span>
                        </button>
                    )}

                    <button
                        onClick={() => { onOpenFilterPopup(); setSettingsOpen(false); closePhasePicker(); }}
                        title="Mở side panel Filter"
                        className={`flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-white transition-colors ${isFilterPopupOpen ? 'bg-indigo-700' : activeFilterCount > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                    >
                        <Filter size={13} />
                        <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                    </button>

                    <button
                        onClick={() => canEdit && onSave()}
                        disabled={isSaving || !canEdit}
                        title={!canEdit ? 'Viewer mode: cần Unlock Editor để lưu' : isSaving ? 'Đang lưu...' : 'Lưu JSON'}
                        className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#F0B90B] px-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-[#DFA300] disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-amber-600"
                    >
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>

                    <div className="relative" ref={settingsRef}>
                        <button
                            onClick={() => { setSettingsOpen(p => !p); closePhasePicker(); }}
                            title="Cài đặt"
                            className={`flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold transition-colors ${settingsOpen ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'}`}
                        >
                            <Settings size={13} className={settingsOpen ? 'animate-spin-slow' : ''} />
                            <span>Setting</span>
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
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Phạm vi Timeline</p>

                                {/* Before current date */}
                                <div className="mb-2.5">
                                    <div className="flex items-center gap-1 mb-1">
                                        <ChevronRight size={10} className="text-gray-400 rotate-180" />
                                        <span className="text-xs text-gray-500 font-semibold">Trước hiện tại</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {BEFORE_OPTIONS.map(opt => (
                                            <button
                                                key={opt.weeks}
                                                onClick={() => onBeforeWeeksChange(opt.weeks)}
                                                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors border ${beforeWeeks === opt.weeks
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
                                        <span className="text-xs text-gray-500 font-semibold">Sau hiện tại</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {AFTER_OPTIONS.map(opt => (
                                            <button
                                                key={opt.months}
                                                onClick={() => onAfterMonthsChange(opt.months)}
                                                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors border ${afterMonths === opt.months
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
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Hành động</p>

                                <button
                                    onClick={() => { onExportExcelCurrentView?.(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <Download size={13} />
                                    <span>Xuất Excel (Current View)</span>
                                </button>

                                <button
                                    onClick={() => { onExportExcelFullData?.(); setSettingsOpen(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                    <Download size={13} />
                                    <span>Xuất Excel (Full Data)</span>
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
        </div>
    );
}
