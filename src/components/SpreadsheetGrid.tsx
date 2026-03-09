'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
    ColumnWidthMode,
    ItemType,
    Milestone,
    PhaseOption,
    PRIORITY_LEVELS,
    RoadmapDocument,
    RoadmapItem,
    SubcategoryType,
    TimelineMode,
    normalizeItemImages,
    normalizeItemPriority,
    normalizePhaseIds
} from '@/types/roadmap';
import {
    flattenRoadmap, FlattenedItem, filterRoadmapTree, findNodeById,
    generateTimelineDays, updateNodeById, deleteNodeById, addChildToNode, reorderItems
} from '@/utils/roadmapHelpers';
import { format, differenceInDays, parseISO, endOfWeek, endOfMonth, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronDown, Pencil, Trash2, PlusCircle, MessageSquare, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import EditPopup from './EditPopup';
import AddNodePopup from './AddNodePopup';

interface GridProps {
    data: RoadmapDocument;
    onDataChange: (newData: RoadmapDocument, shouldSave?: boolean) => void;
    onRootAdd: (newItem: RoadmapItem) => void;
    showConfirm: (message: string) => Promise<boolean>;
    viewStart: string;
    viewEnd: string;
    timelineMode: TimelineMode;
    today: Date;
    filterCategory: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterPhase: string[];
    filterSubcategory: string[];
    canEdit: boolean;
    // Column visibility (lifted to parent for persistence)
    showPriority: boolean;
    setShowPriority: (v: boolean) => void;
    showPhase: boolean;
    setShowPhase: (v: boolean) => void;
    showStartDate: boolean;
    setShowStartDate: (v: boolean) => void;
    showEndDate: boolean;
    setShowEndDate: (v: boolean) => void;
    nameW: number;
    setNameW: (v: number | ((prev: number) => number)) => void;
    nameWMode: ColumnWidthMode;
    setNameWMode: (mode: ColumnWidthMode) => void;
    // Row visibility & expansion (lifted to parent)
    expandedIds: Set<string>;
    setExpandedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    hiddenRowIds: Set<string>;
    setHiddenRowIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

const ROW_HEIGHT = 28;
const COL_W = 26;
const MILESTONE_HEADER_H = 22;

// Fixed column widths (only ID and Actions are truly fixed)
const COL_ID_W = 52;
const COL_ACTIONS_W = 52;
const COL_STATUS_DEFAULT = 110;
const COL_PHASE_MIN = 90;
const COL_PHASE_DEFAULT = 120;
const COL_PHASE_MAX = 320;
const COL_DATE_DEFAULT = 85;
const GAP_H = 8;       // height of hidden-row gap indicator

// Gap render entry type
type RenderEntry =
    | { kind: 'row'; row: FlattenedItem }
    | { kind: 'gap'; ids: string[]; names: string[] };

type TimelineUnit = {
    start: Date;
    end: Date;
    labelTop: string;
    labelBottom: string;
};

type HeaderGroup = {
    label: string;
    count: number;
};

const DEPTH_STYLES: { bg: string; font: string }[] = [
    { bg: '#c6d3ea', font: 'bold' },     // Level 0 (category)
    { bg: '#d4e4c8', font: 'bold' },     // Level 1 (subcategory)
    { bg: '#e8e8e8', font: 'bold' },     // Level 2 (group)
    { bg: '#ffffff', font: 'normal' },   // Level 3 (feature)
    { bg: '#f9fafb', font: 'normal' },   // Level 4/5 (team styles fallback)
];

const STATUS_BAR_COLOR: Record<string, string> = {
    'Done': '#22c55e',
    'PD In Progress': '#f59e0b',
    'Dev In Progress': '#3b82f6',
    'Not Started': '#9ca3af',
};

const STATUS_TAG_BG: Record<string, string> = {
    'Done': '#bbf7d0',
    'PD In Progress': '#fef3c7',
    'Dev In Progress': '#bfdbfe',
    'Not Started': '#f3f4f6',
};
const STATUS_TAG_TEXT: Record<string, string> = {
    'Done': '#166534',
    'PD In Progress': '#92400e',
    'Dev In Progress': '#1e40af',
    'Not Started': '#374151',
};

const PRIORITY_TAG_BG: Record<string, string> = {
    'High': '#fee2e2',
    'Medium': '#fef9c3',
    'Low': '#dcfce7',
    'Reported': '#fce7f3',
};
const PRIORITY_TAG_TEXT: Record<string, string> = {
    'High': '#b91c1c',
    'Medium': '#854d0e',
    'Low': '#166534',
    'Reported': '#9d174d',
};
const COL_PRIORITY_W = 70;
const MAX_QUICK_NOTE_LENGTH = 500;

const CHILD_TYPE_MAP: Record<ItemType, ItemType | null> = {
    category: 'subcategory',
    subcategory: 'group',
    group: 'feature',
    feature: null,
    team: null,
};

// Subcategory type badge styles
const SUB_TYPE_STYLE: Record<SubcategoryType, { bg: string; text: string }> = {
    'Feature': { bg: '#dbeafe', text: '#1d4ed8' },
    'Bug': { bg: '#fee2e2', text: '#b91c1c' },
    'Growth Camp': { bg: '#d1fae5', text: '#065f46' },
};

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function countWorkdays(start: Date, end: Date): number {
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) count++;
        d.setDate(d.getDate() + 1);
    }
    return count;
}

function estimatePhaseCellWidth(labels: string[]): number {
    if (labels.length === 0) return 28;
    return labels.reduce((sum, label) => {
        const chipW = Math.min(120, Math.max(30, label.length * 6 + 14));
        return sum + chipW;
    }, 0) + Math.max(0, labels.length - 1) * 4 + 12;
}

export default function SpreadsheetGrid({ data, onDataChange, onRootAdd, showConfirm, viewStart, viewEnd, today,
    timelineMode,
    filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, canEdit,
    showPriority, setShowPriority, showPhase, setShowPhase, showStartDate, setShowStartDate, showEndDate, setShowEndDate,
    nameW, setNameW, nameWMode, setNameWMode,
    expandedIds, setExpandedIds, hiddenRowIds, setHiddenRowIds
}: GridProps) {
    const leftPaneRef = useRef<HTMLDivElement>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);

    // ── Column widths (resizable) ──
    const [statusW, setStatusW] = useState(COL_STATUS_DEFAULT);
    const [phaseW, setPhaseW] = useState(COL_PHASE_DEFAULT);
    const [startDateW, setStartDateW] = useState(COL_DATE_DEFAULT);
    const [endDateW, setEndDateW] = useState(COL_DATE_DEFAULT);

    // ── Priority dropdown open state ──
    const [openPriorityId, setOpenPriorityId] = useState<string | null>(null);
    const [openPhaseId, setOpenPhaseId] = useState<string | null>(null);
    const [activeBarInfoId, setActiveBarInfoId] = useState<string | null>(null);

    // ── CRUD states ──
    const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
    const [addingToParent, setAddingToParent] = useState<{ id: string; name: string; childType: ItemType } | null>(null);

    // ── Drag & Drop States ──
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [activeNotePreview, setActiveNotePreview] = useState<{ id: string; top: number; left: number } | null>(null);
    const [activeImagePreviewId, setActiveImagePreviewId] = useState<string | null>(null);
    const [activeImagePreviewIndex, setActiveImagePreviewIndex] = useState(0);
    const [isQuickNoteEditing, setIsQuickNoteEditing] = useState(false);
    const [quickNoteDraft, setQuickNoteDraft] = useState('');
    const [quickNoteSaving, setQuickNoteSaving] = useState(false);

    const handleScrollLeft = (e: React.UIEvent<HTMLDivElement>) => {
        if (rightPaneRef.current) rightPaneRef.current.scrollTop = e.currentTarget.scrollTop;
        if (activeNotePreview) void closeQuickNotePreview();
        if (openPriorityId) setOpenPriorityId(null);
        if (openPhaseId) setOpenPhaseId(null);
    };
    const handleScrollRight = (e: React.UIEvent<HTMLDivElement>) => {
        if (leftPaneRef.current) leftPaneRef.current.scrollTop = e.currentTarget.scrollTop;
        if (activeNotePreview) void closeQuickNotePreview();
        if (openPriorityId) setOpenPriorityId(null);
        if (openPhaseId) setOpenPhaseId(null);
    };

    const handleNameMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, fullName: string) => {
        const el = e.currentTarget;
        const isTruncated = el.scrollWidth > el.clientWidth;
        if (isTruncated) el.title = fullName;
        else el.removeAttribute('title');
    };

    // ── Individual row hide (leaf rows only) ──
    const toggleHideRow = (id: string) => {
        setHiddenRowIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const visibleItems = useMemo(() => filterRoadmapTree(data.items, {
        category: filterCategory,
        status: filterStatus,
        team: filterTeam,
        priority: filterPriority,
        phase: filterPhase,
        subcategory: filterSubcategory,
    }), [data.items, filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory]);

    const phaseOptions: PhaseOption[] = useMemo(() => {
        const milestones = data.milestones || [];
        return milestones.map((phase, index) => {
            const id = (phase.id || '').trim() || `phase_${index + 1}`;
            const label = (phase.label || '').trim() || `Phase ${index + 1}`;
            const hasSchedule = !!((phase.startDate || '').trim() && (phase.endDate || '').trim());
            return { id, label, hasSchedule };
        });
    }, [data.milestones]);

    const phaseLabelById = useMemo(() => {
        const labelMap = new Map<string, string>();
        phaseOptions.forEach(phase => labelMap.set(phase.id, phase.label));
        return labelMap;
    }, [phaseOptions]);

    const phaseShortById = useMemo(() => {
        const shortMap = new Map<string, string>();
        phaseOptions.forEach((phase, index) => shortMap.set(phase.id, `P${index + 1}`));
        return shortMap;
    }, [phaseOptions]);

    const groupInlinePhaseIdsById = useMemo(() => {
        const result = new Map<string, string[]>();
        const walk = (item: RoadmapItem): string[] => {
            const ownPhaseIds = normalizePhaseIds(item.phaseIds);
            const descendantPhaseSet = new Set<string>();

            if (item.children && item.children.length > 0) {
                item.children.forEach(child => {
                    const childPhaseIds = walk(child);
                    childPhaseIds.forEach(phaseId => descendantPhaseSet.add(phaseId));
                });
            }

            if (item.type === 'group') {
                result.set(item.id, ownPhaseIds.length > 0 ? ownPhaseIds : Array.from(descendantPhaseSet));
            }

            ownPhaseIds.forEach(phaseId => descendantPhaseSet.add(phaseId));
            return Array.from(descendantPhaseSet);
        };

        data.items.forEach(item => {
            walk(item);
        });

        return result;
    }, [data.items]);

    const flattened: FlattenedItem[] = useMemo(() => {
        const raw = flattenRoadmap(visibleItems);
        return raw.filter(item => !item.parentIds.some(pid => !expandedIds.has(pid)));
    }, [visibleItems, expandedIds]);

    const activeNoteItem = useMemo(() => {
        if (!activeNotePreview) return null;
        return findNodeById(data.items, activeNotePreview.id);
    }, [activeNotePreview, data.items]);
    const activeNoteText = activeNoteItem?.quickNote?.trim() || '';
    const activeNoteOriginal = activeNoteItem?.quickNote || '';
    const activeImagePreviewItem = useMemo(() => {
        if (!activeImagePreviewId) return null;
        return findNodeById(data.items, activeImagePreviewId);
    }, [activeImagePreviewId, data.items]);
    const activeImagePreviewImages = useMemo(() => {
        if (!activeImagePreviewItem) return [];
        return normalizeItemImages(activeImagePreviewItem);
    }, [activeImagePreviewItem]);
    const normalizedActiveImagePreviewIndex = activeImagePreviewImages.length === 0
        ? -1
        : Math.max(0, Math.min(activeImagePreviewIndex, activeImagePreviewImages.length - 1));
    const activeImagePreviewImage = normalizedActiveImagePreviewIndex >= 0
        ? activeImagePreviewImages[normalizedActiveImagePreviewIndex]
        : null;
    const activeImagePreviewUrl = activeImagePreviewImage?.url?.trim() || '';
    const activeImagePreviewName = activeImagePreviewImage?.name?.trim() || activeImagePreviewItem?.name || 'image';
    const activeImagePreviewNote = activeImagePreviewItem?.quickNote?.trim() || '';
    const isQuickNoteDirty = !!activeNoteItem && quickNoteDraft !== activeNoteOriginal;

    const resetQuickNoteState = useCallback(() => {
        setActiveNotePreview(null);
        setIsQuickNoteEditing(false);
        setQuickNoteDraft('');
        setQuickNoteSaving(false);
    }, []);

    const closeQuickNotePreview = useCallback(async (skipDirtyCheck = false): Promise<boolean> => {
        if (!activeNotePreview) return true;
        if (!skipDirtyCheck && canEdit && isQuickNoteEditing && isQuickNoteDirty) {
            const confirmClose = await showConfirm('Quick note đang có thay đổi chưa lưu. Đóng mà không lưu?');
            if (!confirmClose) return false;
        }
        resetQuickNoteState();
        return true;
    }, [activeNotePreview, canEdit, isQuickNoteDirty, isQuickNoteEditing, resetQuickNoteState, showConfirm]);

    useEffect(() => {
        if (!activeNotePreview) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-quick-note-popover="true"]')) return;
            if (target.closest('[data-quick-note-trigger="true"]')) return;
            void closeQuickNotePreview();
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') void closeQuickNotePreview();
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [activeNotePreview, closeQuickNotePreview]);

    useEffect(() => {
        if (!activeImagePreviewId) return;
        if (!activeImagePreviewItem || activeImagePreviewImages.length === 0 || !activeImagePreviewUrl) {
            setActiveImagePreviewId(null);
            setActiveImagePreviewIndex(0);
            return;
        }
        if (activeImagePreviewIndex >= activeImagePreviewImages.length) {
            setActiveImagePreviewIndex(0);
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveImagePreviewId(null);
                setActiveImagePreviewIndex(0);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = previousOverflow;
        };
    }, [activeImagePreviewId, activeImagePreviewItem, activeImagePreviewImages.length, activeImagePreviewIndex, activeImagePreviewUrl]);

    useEffect(() => {
        if (!openPriorityId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-priority-dropdown="true"]')) return;
            if (target.closest('[data-priority-trigger="true"]')) return;
            setOpenPriorityId(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenPriorityId(null);
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [openPriorityId]);

    useEffect(() => {
        if (!openPhaseId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-phase-dropdown="true"]')) return;
            if (target.closest('[data-phase-trigger="true"]')) return;
            setOpenPhaseId(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenPhaseId(null);
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [openPhaseId]);

    // Tự động căn chỉnh độ rộng cột FEATURES theo nội dung hiển thị (có giới hạn min max)
    useEffect(() => {
        if (nameWMode !== 'auto') return;
        let maxW = 160; // Chiều rộng tối thiểu
        for (const row of flattened) {
            let displayDepth = row.depth;
            if (row.type === 'feature') displayDepth = row.depth + 1;
            else if (row.type === 'team' && row.depth >= 4) displayDepth = row.depth + 1;

            // khoảng thụt vào (displayDepth * 14) + icon (~14px) + font size chữ (~7.5px/char)
            let w = (displayDepth * 14) + 20 + (row.name.length * 7.5);
            if (row.type === 'subcategory' && row.subcategoryType) w += 65; // khoảng không cho cái tag loại
            if (w > maxW) maxW = w;
        }
        maxW += 5; // padding
        if (maxW > 450) maxW = 450; // Cap tối đa 450px
        setNameW(maxW);
    }, [flattened, nameWMode, setNameW]);

    useEffect(() => {
        if (!showPhase) return;
        let next = COL_PHASE_MIN;
        for (const row of flattened) {
            const labels = normalizePhaseIds(row.phaseIds).map(phaseId => phaseLabelById.get(phaseId) || 'Unknown');
            next = Math.max(next, estimatePhaseCellWidth(labels));
        }
        setPhaseW(Math.max(COL_PHASE_MIN, Math.min(COL_PHASE_MAX, next)));
    }, [flattened, phaseLabelById, showPhase]);

    // Build render list: group consecutive hidden leaf rows into gap entries
    const renderList: RenderEntry[] = useMemo(() => {
        const result: RenderEntry[] = [];
        let gapIds: string[] = [];
        let gapNames: string[] = [];
        for (const row of flattened) {
            const isHidden = !row.children?.length && hiddenRowIds.has(row.id);
            if (isHidden) {
                gapIds.push(row.id);
                gapNames.push(row.name);
            } else {
                if (gapIds.length > 0) {
                    result.push({ kind: 'gap', ids: [...gapIds], names: [...gapNames] });
                    gapIds = []; gapNames = [];
                }
                result.push({ kind: 'row', row });
            }
        }
        if (gapIds.length > 0) result.push({ kind: 'gap', ids: [...gapIds], names: [...gapNames] });
        return result;
    }, [flattened, hiddenRowIds]);

    const timelineDays = useMemo(() => generateTimelineDays(viewStart, viewEnd, 0), [viewStart, viewEnd]);

    const timelineUnitWidth = useMemo(() => {
        if (timelineMode === 'day') return COL_W;
        if (timelineMode === 'week') return 46;
        return 64;
    }, [timelineMode]);

    const timelineUnits: TimelineUnit[] = useMemo(() => {
        if (timelineDays.length === 0) return [];
        if (timelineMode === 'day') {
            return timelineDays.map(day => ({
                start: day,
                end: day,
                labelTop: day.getDay() === 6 ? 'Sa' : day.getDay() === 0 ? 'Su' : format(day, 'EEE')[0],
                labelBottom: format(day, 'd'),
            }));
        }

        if (timelineMode === 'week') {
            const weekStarts = eachWeekOfInterval(
                { start: timelineDays[0], end: timelineDays[timelineDays.length - 1] },
                { weekStartsOn: 1 }
            );
            return weekStarts.map(start => ({
                start,
                end: endOfWeek(start, { weekStartsOn: 1 }),
                labelTop: `W${format(start, 'ww')}`,
                labelBottom: format(start, 'MMM d'),
            }));
        }

        const monthStarts = eachMonthOfInterval({ start: timelineDays[0], end: timelineDays[timelineDays.length - 1] });
        return monthStarts.map(start => ({
            start,
            end: endOfMonth(start),
            labelTop: format(start, 'MMM'),
            labelBottom: format(start, 'yy'),
        }));
    }, [timelineDays, timelineMode]);

    const todayIndex = useMemo(() => {
        if (!today) return -1;
        return timelineUnits.findIndex(unit => today >= unit.start && today <= unit.end);
    }, [today, timelineUnits]);

    const headerGroups: HeaderGroup[] = useMemo(() => {
        const groups: HeaderGroup[] = [];
        let currentKey = '';
        for (const unit of timelineUnits) {
            let key = '';
            let label = '';
            if (timelineMode === 'day') {
                key = format(unit.start, 'yyyy-ww');
                label = `W${format(unit.start, 'ww')} · ${format(unit.start, 'MMM d')}`;
            } else if (timelineMode === 'week') {
                key = format(unit.start, 'yyyy-MM');
                label = format(unit.start, 'MMM yyyy');
            } else {
                key = format(unit.start, 'yyyy');
                label = format(unit.start, 'yyyy');
            }

            if (groups.length === 0 || key !== currentKey) {
                groups.push({ label, count: 1 });
                currentKey = key;
            } else {
                groups[groups.length - 1].count += 1;
            }
        }
        return groups;
    }, [timelineUnits, timelineMode]);

    const milestoneRanges = useMemo(() => {
        const milestones = data.milestones || [];
        return milestones.map(m => {
            const milestoneStart = parseISO(m.startDate);
            const milestoneEndRaw = parseISO(m.endDate);
            if (Number.isNaN(milestoneStart.getTime())) return null;
            const milestoneEnd = Number.isNaN(milestoneEndRaw.getTime()) ? milestoneStart : milestoneEndRaw;

            let firstIdx = -1;
            let lastIdx = -1;
            for (let i = 0; i < timelineUnits.length; i++) {
                const unit = timelineUnits[i];
                const overlaps = unit.end >= milestoneStart && unit.start <= milestoneEnd;
                if (!overlaps) continue;
                if (firstIdx === -1) firstIdx = i;
                lastIdx = i;
            }
            if (firstIdx < 0 || lastIdx < 0) return null;

            return {
                ...m,
                start: milestoneStart,
                end: milestoneEnd,
                left: firstIdx * timelineUnitWidth,
                width: (lastIdx - firstIdx + 1) * timelineUnitWidth,
            };
        }).filter(Boolean) as (Milestone & { start: Date; end: Date; left: number; width: number })[];
    }, [data.milestones, timelineUnits, timelineUnitWidth]);

    // ── CRUD handlers ──
    const handleEditSave = (updated: RoadmapItem) => {
        if (!canEdit) return;
        onDataChange({ ...data, items: updateNodeById(data.items, updated.id, updated) });
        if (updated.children && updated.children.length > 0) {
            setExpandedIds(prev => new Set([...prev, updated.id]));
        }
    };
    const handleDelete = async (id: string) => {
        if (!canEdit) return;
        if (!(await showConfirm('Bạn có chắc muốn xoá mục này và toàn bộ nội dung con của nó không?'))) return;
        onDataChange({ ...data, items: deleteNodeById(data.items, id) });
    };
    const handleAddChild = (parentId: string, newItem: RoadmapItem) => {
        if (!canEdit) return;
        if (parentId === '__ROOT__') { onRootAdd(newItem); return; }
        const newItems = addChildToNode(data.items, parentId, newItem);

        const nextExp = new Set([...expandedIds, parentId]);
        if (newItem.children && newItem.children.length > 0) {
            nextExp.add(newItem.id);
        }

        setExpandedIds(nextExp);
        onDataChange({ ...data, items: newItems });
    };

    const isValidSameLayerDrop = useCallback((sourceId: string, targetId: string): boolean => {
        if (sourceId === targetId) return false;
        const source = flattened.find(item => item.id === sourceId);
        const target = flattened.find(item => item.id === targetId);
        if (!source || !target) return false;
        if (source.type !== target.type) return false;
        const sourceParent = source.parentIds[source.parentIds.length - 1] || null;
        const targetParent = target.parentIds[target.parentIds.length - 1] || null;
        return sourceParent === targetParent;
    }, [flattened]);

    // ── Drag & Drop Handlers ──
    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (!canEdit) return;
        setDraggedId(id);
        setDragOverId(null);
        e.dataTransfer.effectAllowed = 'move';
        // Setting transparent image helps styling custom drag ghost if needed
    };
    const handleDragOver = (e: React.DragEvent, id: string) => {
        if (!canEdit) return;
        e.preventDefault(); // enable drop
        if (draggedId && isValidSameLayerDrop(draggedId, id)) {
            e.dataTransfer.dropEffect = 'move';
            setDragOverId(id);
        } else {
            e.dataTransfer.dropEffect = 'none';
            setDragOverId(null);
        }
    };
    const handleDragLeave = () => {
        setDragOverId(null);
    };
    const handleDrop = (e: React.DragEvent, targetId: string) => {
        if (!canEdit) return;
        e.preventDefault();
        if (draggedId && isValidSameLayerDrop(draggedId, targetId)) {
            const newItems = reorderItems(data.items, draggedId, targetId);
            if (newItems !== data.items) {
                onDataChange({ ...data, items: newItems }, true); // Pass true to trigger auto-save if supported
            }
        }
        setDraggedId(null);
        setDragOverId(null);
    };
    const handleDragEnd = () => {
        setDraggedId(null);
        setDragOverId(null);
    };

    const openQuickNotePreview = async (event: React.MouseEvent, row: FlattenedItem) => {
        event.stopPropagation();
        const anchorEl = event.currentTarget as HTMLElement | null;
        if (activeImagePreviewId) setActiveImagePreviewId(null);
        if (activeNotePreview?.id === row.id) {
            await closeQuickNotePreview();
            return;
        }
        if (activeNotePreview) {
            const closed = await closeQuickNotePreview();
            if (!closed) return;
        }

        const triggerRect = anchorEl?.getBoundingClientRect?.();
        if (!triggerRect) return;
        const popoverWidth = 320;
        const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - popoverWidth - 8));
        const top = Math.min(triggerRect.bottom + 8, window.innerHeight - 220);
        const note = row.quickNote || '';

        setActiveNotePreview({ id: row.id, top, left });
        setQuickNoteDraft(note);
        setIsQuickNoteEditing(canEdit && note.trim().length === 0);
        setQuickNoteSaving(false);
    };

    const openImagePreview = async (event: React.MouseEvent, row: FlattenedItem) => {
        event.stopPropagation();
        const rowImages = normalizeItemImages(row);
        if (rowImages.length === 0) return;

        if (activeImagePreviewId === row.id) {
            setActiveImagePreviewId(null);
            setActiveImagePreviewIndex(0);
            return;
        }

        if (activeNotePreview) {
            const closed = await closeQuickNotePreview();
            if (!closed) return;
        }

        setActiveImagePreviewId(row.id);
        setActiveImagePreviewIndex(0);
    };

    const showPrevPreviewImage = () => {
        if (activeImagePreviewImages.length <= 1) return;
        setActiveImagePreviewIndex(prev => {
            const safePrev = prev < 0 ? 0 : prev;
            return safePrev === 0 ? activeImagePreviewImages.length - 1 : safePrev - 1;
        });
    };

    const showNextPreviewImage = () => {
        if (activeImagePreviewImages.length <= 1) return;
        setActiveImagePreviewIndex(prev => {
            const safePrev = prev < 0 ? 0 : prev;
            return safePrev === activeImagePreviewImages.length - 1 ? 0 : safePrev + 1;
        });
    };

    const openEditor = (id: string) => {
        if (!canEdit) return;
        const node = findNodeById(data.items, id);
        if (node) setEditingItem(node);
    };

    const openFullEditorFromQuickNote = async () => {
        if (!canEdit || !activeNoteItem) return;
        if (isQuickNoteEditing && isQuickNoteDirty) {
            const confirmDiscard = await showConfirm('Quick note đang có thay đổi chưa lưu. Mở Edit mà không lưu?');
            if (!confirmDiscard) return;
        }
        const id = activeNoteItem.id;
        resetQuickNoteState();
        openEditor(id);
    };

    const toggleQuickNoteEditMode = async () => {
        if (!canEdit || !activeNoteItem) return;
        if (isQuickNoteEditing) {
            if (isQuickNoteDirty) {
                const confirmDiscard = await showConfirm('Quick note đang có thay đổi chưa lưu. Huỷ chỉnh sửa nhanh?');
                if (!confirmDiscard) return;
            }
            setQuickNoteDraft(activeNoteOriginal);
            setIsQuickNoteEditing(false);
            return;
        }
        setIsQuickNoteEditing(true);
    };

    const handleQuickNoteSave = async () => {
        if (!canEdit || !activeNoteItem || quickNoteSaving || !isQuickNoteDirty) return;
        setQuickNoteSaving(true);
        try {
            const source = findNodeById(data.items, activeNoteItem.id);
            if (!source) return;
            const updatedSource = { ...source };
            const normalizedNote = quickNoteDraft.trim();
            if (normalizedNote.length > 0) updatedSource.quickNote = normalizedNote;
            else delete updatedSource.quickNote;
            onDataChange({ ...data, items: updateNodeById(data.items, activeNoteItem.id, updatedSource) }, true);
            setQuickNoteDraft(normalizedNote);
            setIsQuickNoteEditing(false);
        } finally {
            setQuickNoteSaving(false);
        }
    };

    const updateFromSource = (id: string, mapper: (source: RoadmapItem) => RoadmapItem) => {
        if (!canEdit) return;
        const source = findNodeById(data.items, id);
        if (!source) return;
        onDataChange({ ...data, items: updateNodeById(data.items, id, mapper(source)) });
    };

    // ── Column resize via mouse drag ──
    const startResize = useCallback((
        e: React.MouseEvent,
        setter: React.Dispatch<React.SetStateAction<number>>,
        minW: number
    ) => {
        e.preventDefault();
        const startX = e.clientX;
        let startW = 0;
        setter(w => { startW = w; return w; }); // capture current

        const onMove = (ev: MouseEvent) => {
            const next = Math.max(minW, startW + (ev.clientX - startX));
            setter(next);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    // ── Computed total left pane width ──
    const totalLeftW = COL_ID_W + nameW
        + (showPriority ? COL_PRIORITY_W : 0)
        + statusW
        + (showPhase ? phaseW : 0)
        + (showStartDate ? startDateW : 0)
        + (showEndDate ? endDateW : 0)
        + COL_ACTIONS_W;
    const TOTAL_HEADER_H = MILESTONE_HEADER_H + ROW_HEIGHT + ROW_HEIGHT;

    // Grid template for left pane rows/header
    const gridTemplate = `${COL_ID_W}px ${nameW}px`
        + (showPriority ? ` ${COL_PRIORITY_W}px` : '')
        + ` ${statusW}px`
        + (showPhase ? ` ${phaseW}px` : '')
        + (showStartDate ? ` ${startDateW}px` : '')
        + (showEndDate ? ` ${endDateW}px` : '')
        + ` ${COL_ACTIONS_W}px`;

    return (
        <div className="flex h-full w-full bg-white overflow-hidden text-[12px] text-gray-900 font-sans">
            {canEdit && editingItem && (
                <EditPopup
                    item={editingItem}
                    phases={phaseOptions}
                    onSave={handleEditSave}
                    onClose={() => setEditingItem(null)}
                />
            )}
            {canEdit && addingToParent && (
                <AddNodePopup parentId={addingToParent.id} parentName={addingToParent.name} childType={addingToParent.childType}
                    onAdd={handleAddChild} onClose={() => setAddingToParent(null)} />
            )}

            {/* ── LEFT PANE ── */}
            <div className="shrink-0 border-r-2 border-gray-500 flex flex-col overflow-hidden" style={{ width: totalLeftW }}>

                {/* Left header */}
                <div
                    className="shrink-0 border-b-2 border-gray-500 bg-gray-300 grid text-[11px] font-bold text-gray-700 select-none relative"
                    style={{ gridTemplateColumns: gridTemplate, height: TOTAL_HEADER_H }}
                >
                    {/* ID */}
                    <div className="flex items-center justify-center border-r border-gray-400 relative">
                        ID
                    </div>

                    {/* FEATURES – resize handle on right */}
                    <div className="flex items-center px-2 border-r border-gray-400 relative group/col">
                        FEATURES
                        <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/40 z-10"
                            onMouseDown={e => { setNameWMode('manual'); startResize(e, setNameW, 120); }}
                            title="Kéo để thay đổi cột"
                        />
                    </div>

                    {/* PRIORITY header – click to hide */}
                    {showPriority && (
                        <div className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột Priority"
                            onClick={() => setShowPriority(false)}
                            style={{ minWidth: COL_PRIORITY_W, width: COL_PRIORITY_W }}
                        >
                            <span className="text-indigo-700">PRIORITY</span>
                        </div>
                    )}

                    {/* STATUS – resize handle on right */}
                    <div className="flex items-center justify-center border-r border-gray-400 relative group/col">
                        STATUS
                        <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/40 z-10"
                            onMouseDown={e => startResize(e, setStatusW, 70)}
                            title="Kéo để thay đổi cột"
                        />
                    </div>

                    {/* PHASE header – click to hide */}
                    {showPhase && (
                        <div
                            className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột Phase"
                            onClick={() => setShowPhase(false)}
                            style={{ minWidth: phaseW, width: phaseW }}
                        >
                            <span className="text-indigo-700">PHASE</span>
                        </div>
                    )}

                    {/* START DATE */}
                    {showStartDate && (
                        <div className="flex items-center justify-center border-r border-gray-400 relative group/col cursor-pointer hover:bg-indigo-100 transition-colors"
                            title="Click để ẩn cột Bắt đầu"
                            onClick={() => setShowStartDate(false)}>
                            <span className="text-indigo-700">START</span>
                            <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/40 z-10"
                                onMouseDown={e => { e.stopPropagation(); startResize(e, setStartDateW, 60); }}
                                title="Kéo để thay đổi cột"
                            />
                        </div>
                    )}

                    {/* END DATE */}
                    {showEndDate && (
                        <div className="flex items-center justify-center border-r border-gray-400 relative group/col cursor-pointer hover:bg-indigo-100 transition-colors"
                            title="Click để ẩn cột Kết thúc"
                            onClick={() => setShowEndDate(false)}>
                            <span className="text-indigo-700">END</span>
                            <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/40 z-10"
                                onMouseDown={e => { e.stopPropagation(); startResize(e, setEndDateW, 60); }}
                                title="Kéo để thay đổi cột"
                            />
                        </div>
                    )}

                    {/* Actions column header – shows restore buttons when hidden */}
                    <div className="flex items-center flex-wrap justify-center gap-0.5 px-0.5">
                        {!showPriority && (
                            <button title="Hiện cột Priority" onClick={() => setShowPriority(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                P
                            </button>
                        )}
                        {!showPhase && (
                            <button title="Hiện cột Phase" onClick={() => setShowPhase(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                Ph
                            </button>
                        )}
                        {!showStartDate && (
                            <button title="Hiện cột Bắt đầu" onClick={() => setShowStartDate(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                S
                            </button>
                        )}
                        {!showEndDate && (
                            <button title="Hiện cột Kết thúc" onClick={() => setShowEndDate(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                E
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrollable rows */}
                <div ref={leftPaneRef} className="overflow-y-auto overflow-x-hidden flex-1" onScroll={handleScrollLeft} style={{ scrollbarWidth: 'none' }}>
                    {renderList.map((entry) => {
                        if (entry.kind === 'gap') {
                            const key = entry.ids.join(',');
                            const label = `Hiện ${entry.ids.length} dòng: ${entry.names.join(', ')}`;
                            const restoreAll = () => entry.ids.forEach(id => toggleHideRow(id));
                            return (
                                <div key={key}
                                    className="relative group/gap border-b border-gray-100 cursor-pointer"
                                    style={{ height: GAP_H }}
                                    title={label}
                                    onClick={restoreAll}
                                >
                                    {/* Thin line — visible on hover */}
                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-transparent group-hover/gap:bg-indigo-300 transition-colors" />
                                    {/* Badge at ID column on hover */}
                                    <div className="absolute top-0 bottom-0 flex items-center justify-center opacity-0 group-hover/gap:opacity-100 transition-opacity z-10"
                                        style={{ left: 0, width: COL_ID_W }}>
                                        <span className="text-[9px] font-bold text-white bg-indigo-500 rounded-full px-1.5 leading-tight shadow">
                                            +{entry.ids.length}
                                        </span>
                                    </div>
                                </div>
                            );
                        }

                        const { row } = entry;
                        const style = DEPTH_STYLES[Math.min(row.depth, DEPTH_STYLES.length - 1)];
                        const hasChildren = row.children && row.children.length > 0;
                        const isExpanded = expandedIds.has(row.id);
                        const childType = CHILD_TYPE_MAP[row.type];
                        const hasQuickNote = !!row.quickNote?.trim();
                        const rowImages = normalizeItemImages(row);
                        const quickImageCount = rowImages.length;
                        const hasQuickImage = quickImageCount > 0;
                        const isImagePreviewActive = activeImagePreviewId === row.id;
                        const normalizedRowPriority = normalizeItemPriority(row.priority);
                        const rowPhaseIds = normalizePhaseIds(row.phaseIds);
                        const rowPhaseIdSet = new Set(rowPhaseIds);
                        const rowPhaseLabels = rowPhaseIds.map(phaseId => phaseLabelById.get(phaseId) || 'Unknown');
                        const rowPhaseTitle = rowPhaseLabels.join(', ');
                        const groupInlinePhaseIds = row.type === 'group' ? (groupInlinePhaseIdsById.get(row.id) || []) : [];
                        const groupInlinePhaseTags = groupInlinePhaseIds.map(phaseId => ({
                            id: phaseId,
                            short: phaseShortById.get(phaseId) || 'P?',
                            full: phaseLabelById.get(phaseId) || 'Unknown',
                        }));
                        const groupInlinePhaseVisible = groupInlinePhaseTags.slice(0, 2);
                        const groupInlinePhaseMore = Math.max(0, groupInlinePhaseTags.length - groupInlinePhaseVisible.length);
                        const groupInlinePhaseMoreTitle = groupInlinePhaseTags
                            .slice(2)
                            .map(tag => `${tag.short}: ${tag.full}`)
                            .join(', ');
                        const shouldShowGroupInlinePhase = row.type === 'group' && groupInlinePhaseTags.length > 0;

                        const canDragRow = canEdit;
                        const isDragged = draggedId === row.id;
                        const isDragOver = dragOverId === row.id;

                        return (
                            <div key={row.id}
                                className={`grid border-b border-gray-300 group hover:brightness-95 ${isDragged ? 'opacity-30' : ''} ${isDragOver ? 'border-t-4 border-t-blue-500' : ''}`}
                                style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT, backgroundColor: style.bg }}
                                draggable={canDragRow}
                                onDragStart={canDragRow ? (e) => handleDragStart(e, row.id) : undefined}
                                onDragOver={canDragRow ? (e) => handleDragOver(e, row.id) : undefined}
                                onDragLeave={canDragRow ? handleDragLeave : undefined}
                                onDrop={canDragRow ? (e) => handleDrop(e, row.id) : undefined}
                                onDragEnd={canDragRow ? handleDragEnd : undefined}
                            >

                                {/* ID cell */}
                                <div
                                    className={`flex items-center justify-center border-r border-gray-300 text-[10px] select-none transition-colors cursor-pointer ${hasChildren ? 'hover:bg-indigo-50' : 'hover:bg-red-50'
                                        }`}
                                    onClick={() => hasChildren ? toggleExpand(row.id) : toggleHideRow(row.id)}
                                    title={hasChildren
                                        ? (isExpanded ? 'Thu gọn children' : 'Mở rộng children')
                                        : 'Click để ẩn dòng này'
                                    }
                                >
                                    {hasChildren ? (
                                        <span className={`font-black text-[13px] leading-none select-none ${isExpanded ? 'text-indigo-400' : 'text-indigo-600'
                                            }`}>
                                            {isExpanded ? '−' : '+'}
                                        </span>
                                    ) : (
                                        <span className="text-[12px] text-gray-300 group-hover:text-red-400 transition-colors select-none font-black leading-none">
                                            −
                                        </span>
                                    )}
                                </div>

                                {/* Name + subcategoryType badge */}
                                <div
                                    className="flex items-center border-r border-gray-300 cursor-pointer select-none gap-1 overflow-hidden"
                                    style={{
                                        paddingLeft: `${(() => {
                                            let displayDepth = row.depth;
                                            if (row.type === 'feature') displayDepth = row.depth + 1;
                                            else if (row.type === 'team' && row.depth >= 4) displayDepth = row.depth + 1;
                                            return displayDepth * 14 + 6;
                                        })()}px`, fontWeight: style.font
                                    }}
                                    onClick={() => openEditor(row.id)}
                                >
                                    {hasChildren
                                        ? (isExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />)
                                        : <span className="w-[14px] shrink-0" />}
                                    {shouldShowGroupInlinePhase && (
                                        <div className="mr-0.5 flex shrink-0 items-center gap-1">
                                            {groupInlinePhaseVisible.map(tag => (
                                                <span
                                                    key={`${row.id}-${tag.id}`}
                                                    className="rounded bg-indigo-100 px-1 py-0 text-[9px] font-semibold text-indigo-700"
                                                    title={`${tag.short}: ${tag.full}`}
                                                >
                                                    {tag.short}
                                                </span>
                                            ))}
                                            {groupInlinePhaseMore > 0 && (
                                                <span
                                                    className="rounded bg-indigo-50 px-1 py-0 text-[9px] font-semibold text-indigo-600"
                                                    title={groupInlinePhaseMoreTitle || `${groupInlinePhaseMore} more phase(s)`}
                                                >
                                                    +{groupInlinePhaseMore}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <span
                                        className="min-w-0 flex-1 truncate"
                                        onMouseEnter={(e) => handleNameMouseEnter(e, row.name)}
                                    >
                                        {row.name}
                                    </span>
                                    {row.type === 'subcategory' && row.subcategoryType && (
                                        <span
                                            className="ml-1 shrink-0 text-[9px] px-1.5 py-0 rounded-full font-bold whitespace-nowrap"
                                            style={{ backgroundColor: SUB_TYPE_STYLE[row.subcategoryType].bg, color: SUB_TYPE_STYLE[row.subcategoryType].text }}
                                        >
                                            {row.subcategoryType}
                                        </span>
                                    )}
                                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                        <button
                                            data-quick-note-trigger="true"
                                            onClick={(e) => { void openQuickNotePreview(e, row); }}
                                            className={`rounded p-0.5 transition-colors ${hasQuickNote ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}
                                            title={hasQuickNote ? 'Xem quick note' : 'Thêm quick note'}
                                        >
                                            <MessageSquare size={12} />
                                        </button>
                                        {hasQuickImage && (
                                            <button
                                                data-quick-note-trigger="true"
                                                onClick={(e) => { void openImagePreview(e, row); }}
                                                className={`relative inline-flex items-center gap-0.5 rounded p-0.5 transition-colors ${isImagePreviewActive
                                                    ? 'text-emerald-700 bg-emerald-100'
                                                    : 'text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700'
                                                    }`}
                                                title="Xem hình"
                                            >
                                                <ImageIcon size={12} />
                                                {quickImageCount > 1 && <span className="text-[9px] font-semibold">{quickImageCount}</span>}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Priority — only for group/feature, hidden when showPriority=false */}
                                {showPriority && (
                                    (row.type === 'group' || row.type === 'feature') ? (
                                        <div
                                            data-priority-trigger="true"
                                            className="flex items-center justify-center border-r border-gray-300 px-1 cursor-pointer hover:bg-black/5 transition-colors relative"
                                            style={{ width: COL_PRIORITY_W }}
                                            title="Click để đổi priority"
                                            onClick={e => {
                                                if (!canEdit) return;
                                                e.stopPropagation();
                                                setOpenPhaseId(null);
                                                setOpenPriorityId(openPriorityId === row.id ? null : row.id);
                                            }}
                                        >
                                            <span
                                                className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                                style={{
                                                    backgroundColor: normalizedRowPriority ? PRIORITY_TAG_BG[normalizedRowPriority] : '#f3f4f6',
                                                    color: normalizedRowPriority ? PRIORITY_TAG_TEXT[normalizedRowPriority] : '#9ca3af'
                                                }}
                                            >
                                                {normalizedRowPriority ?? '—'}
                                            </span>
                                            {canEdit && openPriorityId === row.id && (
                                                <div data-priority-dropdown="true" className="absolute bottom-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg flex flex-col min-w-[90px]">
                                                    {PRIORITY_LEVELS.map(p => {
                                                        const dropdownColor: Record<string, string> = {
                                                            High: '#dc2626',
                                                            Medium: '#d97706',
                                                            Low: '#16a34a',
                                                            Reported: '#be185d',
                                                        };
                                                        return (
                                                            <button key={p} className="text-left text-[11px] px-3 py-1.5 font-bold hover:bg-gray-50 transition-colors"
                                                                style={{ color: dropdownColor[p] }}
                                                                onMouseDown={e => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    updateFromSource(row.id, source => ({ ...source, priority: p }));
                                                                    setOpenPriorityId(null);
                                                                }}
                                                            >{p}</button>
                                                        );
                                                    })}
                                                    <button className="text-left text-[11px] px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                                        onMouseDown={e => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            updateFromSource(row.id, source => {
                                                                const next = { ...source };
                                                                delete next.priority;
                                                                return next;
                                                            });
                                                            setOpenPriorityId(null);
                                                        }}
                                                    >Clear</button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="border-r border-gray-300" style={{ width: COL_PRIORITY_W }} />
                                    )
                                )}

                                {/* Status */}
                                <div className="flex items-center justify-center border-r border-gray-300 px-1 cursor-pointer hover:bg-black/5 transition-colors"
                                    onClick={() => canEdit && openEditor(row.id)}
                                    title="Click để sửa"
                                >
                                    <span className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                        style={{ backgroundColor: STATUS_TAG_BG[row.status] || '#f3f4f6', color: STATUS_TAG_TEXT[row.status] || '#374151' }}>
                                        {row.status}
                                    </span>
                                </div>

                                {/* Phase tags */}
                                {showPhase && (
                                    <div
                                        data-phase-trigger="true"
                                        className={`flex items-center border-r border-gray-300 px-1 relative ${canEdit && phaseOptions.length > 0 ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}`}
                                        title={rowPhaseTitle || 'Chưa gán phase'}
                                        onClick={e => {
                                            if (!canEdit || phaseOptions.length === 0) return;
                                            e.stopPropagation();
                                            setOpenPriorityId(null);
                                            setOpenPhaseId(openPhaseId === row.id ? null : row.id);
                                        }}
                                    >
                                        {rowPhaseLabels.length === 0 ? (
                                            <span className="mx-auto text-[10px] text-gray-400">—</span>
                                        ) : (
                                            <div className="flex w-full items-center justify-center gap-1 overflow-hidden">
                                                {rowPhaseLabels.map((label, idx) => (
                                                    <span
                                                        key={`${row.id}-${label}-${idx}`}
                                                        className="truncate rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-center text-indigo-700"
                                                    >
                                                        {label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {canEdit && openPhaseId === row.id && phaseOptions.length > 0 && (
                                            <div
                                                data-phase-dropdown="true"
                                                className="absolute bottom-full left-0 z-50 mb-1 min-w-[200px] max-w-[260px] rounded border border-gray-200 bg-white shadow-lg"
                                            >
                                                <div className="max-h-52 overflow-auto py-1">
                                                    {phaseOptions.map(phase => {
                                                        const isSelected = rowPhaseIdSet.has(phase.id);
                                                        return (
                                                            <button
                                                                key={phase.id}
                                                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                                                onMouseDown={e => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    updateFromSource(row.id, source => {
                                                                        const current = new Set(normalizePhaseIds(source.phaseIds));
                                                                        if (current.has(phase.id)) current.delete(phase.id);
                                                                        else current.add(phase.id);
                                                                        const next = { ...source };
                                                                        const nextPhaseIds = Array.from(current);
                                                                        if (nextPhaseIds.length > 0) next.phaseIds = nextPhaseIds;
                                                                        else delete next.phaseIds;
                                                                        return next;
                                                                    });
                                                                }}
                                                            >
                                                                <span className={`h-3.5 w-3.5 rounded border text-[10px] leading-[13px] text-center ${isSelected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                                                                <span className="truncate">{phase.label}{!phase.hasSchedule ? ' (Unscheduled)' : ''}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="border-t border-gray-100">
                                                    <button
                                                        className="w-full px-3 py-1.5 text-left text-[11px] text-gray-500 transition-colors hover:bg-gray-50"
                                                        onMouseDown={e => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            updateFromSource(row.id, source => {
                                                                const next = { ...source };
                                                                delete next.phaseIds;
                                                                return next;
                                                            });
                                                            setOpenPhaseId(null);
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Start Date */}
                                {showStartDate && (
                                    <div className="flex items-center justify-center border-r border-gray-300 px-1 text-[10px] text-gray-500 font-mono">
                                        {row.startDate ? format(parseISO(row.startDate), 'dd/MM/yy') : '-'}
                                    </div>
                                )}

                                {/* End Date */}
                                {showEndDate && (
                                    <div className="flex items-center justify-center border-r border-gray-300 px-1 text-[10px] text-gray-500 font-mono">
                                        {row.endDate ? format(parseISO(row.endDate), 'dd/MM/yy') : '-'}
                                    </div>
                                )}

                                {/* Actions */}
                                {canEdit && (
                                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button title="Sửa" className="text-blue-500 hover:text-blue-700" onClick={() => openEditor(row.id)}><Pencil size={12} /></button>
                                        {childType && (
                                            <button title={`Thêm ${childType}`} className="text-green-600 hover:text-green-800"
                                                onClick={() => setAddingToParent({ id: row.id, name: row.name, childType })}>
                                                <PlusCircle size={12} />
                                            </button>
                                        )}
                                        <button title="Xoá" className="text-red-400 hover:text-red-600" onClick={() => handleDelete(row.id)}><Trash2 size={12} /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {canEdit && (
                        <div className="p-2">
                            <button className="text-xs text-green-700 hover:text-green-900 flex items-center gap-1 font-semibold"
                                onClick={() => setAddingToParent({ id: '__ROOT__', name: 'Roadmap', childType: 'category' })}>
                                <PlusCircle size={13} /> Thêm Category
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT PANE – GANTT ── */}
            <div ref={rightPaneRef} className="flex-1 overflow-auto relative" onScroll={handleScrollRight}>
                <div style={{ width: timelineUnits.length * timelineUnitWidth, minWidth: '100%' }}>

                    {/* ── STICKY HEADER ── */}
                    <div className="sticky top-0 z-20 flex flex-col" style={{ height: TOTAL_HEADER_H }}>

                        {/* Row 0: Milestone labels */}
                        <div className="relative flex border-b border-gray-300 bg-white shrink-0 overflow-hidden" style={{ height: MILESTONE_HEADER_H }}>
                            {timelineUnits.map((_, i) => <div key={i} className="shrink-0" style={{ width: timelineUnitWidth }} />)}
                            {milestoneRanges.map((m) => (
                                <div key={m.id} className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1"
                                    style={{ left: m.left, width: m.width, backgroundColor: m.color }} title={m.label}>
                                    {m.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 1: Week groups */}
                        <div className="relative flex border-b border-gray-400 bg-gray-200 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {headerGroups.map((wk, i) => (
                                <div key={i} className="shrink-0 border-r border-gray-400 flex items-center px-1 text-[10px] font-bold text-gray-700 overflow-hidden"
                                    style={{ width: wk.count * timelineUnitWidth }}>
                                    {wk.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 2: Days */}
                        <div className="relative flex border-b-2 border-gray-500 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {timelineUnits.map((unit, idx) => {
                                const isToday = today ? (today >= unit.start && today <= unit.end) : false;
                                const isWeekend = timelineMode === 'day' && (unit.start.getDay() === 0 || unit.start.getDay() === 6);
                                const matchedMilestone = milestoneRanges.find(m => unit.end >= m.start && unit.start <= m.end);
                                const milestoneBg = matchedMilestone?.color;
                                const isMilestoneUnit = !!matchedMilestone;

                                let bg = '#f1f5f9';
                                let textColor = '#64748b';
                                let fontWeight: 'normal' | 'bold' = 'normal';
                                if (isToday) { bg = '#fef08a'; textColor = '#92400e'; fontWeight = 'bold'; }
                                else if (isMilestoneUnit && milestoneBg) { bg = hexToRgba(milestoneBg, 0.3); textColor = milestoneBg; fontWeight = 'bold'; }
                                else if (isWeekend) { bg = '#ede9fe'; textColor = '#7c3aed'; }

                                return (
                                    <div key={idx} className="shrink-0 flex flex-col items-center justify-center border-r border-gray-300 text-[9px]"
                                        style={{ width: timelineUnitWidth, backgroundColor: bg, fontWeight, color: textColor }}>
                                        <div className={timelineMode === 'day' ? 'uppercase' : ''}>{unit.labelTop}</div>
                                        <div>{unit.labelBottom}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── DATA ROWS ── */}
                    <div className="relative group/gantt" onClick={() => setActiveBarInfoId(null)}>
                        {/* Today line */}
                        {today && todayIndex >= 0 && (
                            <div className="absolute top-0 bottom-0 z-10 pointer-events-none"
                                style={{ left: todayIndex * timelineUnitWidth + timelineUnitWidth / 2, width: 2, backgroundColor: '#ef4444' }} />
                        )}

                        {/* Milestone column shading */}
                        {milestoneRanges.map(m => (
                            <div key={m.id} className="absolute top-0 bottom-0 pointer-events-none z-[2]"
                                style={{ left: m.left, width: m.width, backgroundColor: hexToRgba(m.color, 0.12) }} />
                        ))}

                        {/* Weekend shading */}
                        {timelineMode === 'day' && (
                            <div className="absolute inset-0 flex pointer-events-none">
                                {timelineUnits.map((unit, i) => {
                                    const isWeekend = unit.start.getDay() === 0 || unit.start.getDay() === 6;
                                    return <div key={i} className="shrink-0 border-r border-gray-100 h-full"
                                        style={{ width: timelineUnitWidth, backgroundColor: isWeekend ? 'rgba(139,92,246,0.09)' : 'transparent' }} />;
                                })}
                            </div>
                        )}

                        {/* Feature rows */}
                        {renderList.map((entry) => {
                            if (entry.kind === 'gap') {
                                const key = entry.ids.join(',');
                                return (
                                    <div key={key}
                                        className="relative group/gap cursor-pointer border-b border-gray-100"
                                        style={{ height: GAP_H }}
                                        onClick={() => entry.ids.forEach(id => toggleHideRow(id))}
                                    >
                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-transparent group-hover/gap:bg-indigo-200 transition-colors" />
                                    </div>
                                );
                            }

                            const { row } = entry;
                            let barLeft = -1, barWidth = 0, workdays = 0, sprintStr = '';
                            if (row.startDate && row.endDate) {
                                const sd = parseISO(row.startDate);
                                const edRaw = parseISO(row.endDate);
                                if (!Number.isNaN(sd.getTime())) {
                                    const ed = Number.isNaN(edRaw.getTime()) ? sd : edRaw;
                                    let firstIdx = -1;
                                    let lastIdx = -1;
                                    for (let i = 0; i < timelineUnits.length; i++) {
                                        const unit = timelineUnits[i];
                                        const overlaps = unit.end >= sd && unit.start <= ed;
                                        if (!overlaps) continue;
                                        if (firstIdx === -1) firstIdx = i;
                                        lastIdx = i;
                                    }
                                    if (firstIdx >= 0 && lastIdx >= 0) {
                                        const calendarDays = differenceInDays(ed, sd) + 1;
                                        barLeft = firstIdx * timelineUnitWidth;
                                        barWidth = (lastIdx - firstIdx + 1) * timelineUnitWidth;
                                        workdays = countWorkdays(sd, ed);

                                        const sprintsNum = calendarDays / 14;
                                        sprintStr = Number.isInteger(sprintsNum) ? sprintsNum.toString() : sprintsNum.toFixed(1);
                                    }
                                }
                            }
                            const depthStyle = DEPTH_STYLES[Math.min(row.depth, DEPTH_STYLES.length - 1)];
                            const barColor = STATUS_BAR_COLOR[row.status] || '#9ca3af';

                            const isGrowthCamp = row.type === 'subcategory' && row.subcategoryType === 'Growth Camp';

                            const barStyle: React.CSSProperties = {
                                left: barLeft,
                                width: barWidth,
                                backgroundColor: barColor,
                                opacity: 0.9,
                            };

                            if (isGrowthCamp) {
                                barStyle.backgroundImage = `repeating-linear-gradient(45deg, rgba(255,255,255,0.2), rgba(255,255,255,0.2) 8px, transparent 8px, transparent 16px)`;
                            }

                            const hasActiveInfo = activeBarInfoId === row.id;

                            return (
                                <div key={row.id} className="flex relative border-b border-gray-200"
                                    style={{ height: ROW_HEIGHT, backgroundColor: depthStyle.bg }}>
                                    {barLeft >= 0 && (
                                        <div
                                            className="absolute top-[4px] bottom-[4px] rounded shadow-sm z-[5] cursor-pointer transition-all flex items-center justify-center hover:z-20 group-hover/gantt:z-10"
                                            style={barStyle}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveBarInfoId(prev => (prev === row.id ? null : row.id));
                                            }}
                                        >
                                            {isGrowthCamp && <span className="absolute left-1 text-[10px]">🚀</span>}
                                            {hasActiveInfo && (
                                                <div className="absolute z-20 bottom-full mb-1 bg-gray-900/90 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap select-none pointer-events-none shadow-md">
                                                    <div>{row.name}</div>
                                                    <div>{row.startDate} → {row.endDate}</div>
                                                    <div>{sprintStr} sprint · {workdays} ngày · {row.status} {row.progress}%</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {activeNotePreview && activeNoteItem && (
                <div
                    data-quick-note-popover="true"
                    className="fixed z-50 w-[320px] rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-xs"
                    style={{ top: activeNotePreview.top, left: activeNotePreview.left }}
                >
                    {canEdit ? (
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Note</p>
                            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-0.5">
                                <button
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors ${isQuickNoteEditing
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-emerald-700'
                                        }`}
                                    title={isQuickNoteEditing ? 'Đang chỉnh sửa nhanh' : 'Edit nhanh'}
                                    aria-label="Edit nhanh"
                                    onClick={() => { void toggleQuickNoteEditMode(); }}
                                >
                                    <Pencil size={11} />
                                </button>
                                <button
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700 disabled:opacity-50"
                                    title="Open in Edit"
                                    aria-label="Open in Edit"
                                    onClick={() => { void openFullEditorFromQuickNote(); }}
                                    disabled={quickNoteSaving}
                                >
                                    <ExternalLink size={11} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Note</p>
                    )}

                    {canEdit && isQuickNoteEditing ? (
                        <div>
                            <div className="flex justify-end mb-1">
                                <span className="text-[10px] text-slate-400">{quickNoteDraft.length}/{MAX_QUICK_NOTE_LENGTH}</span>
                            </div>
                            <textarea
                                rows={4}
                                value={quickNoteDraft}
                                onChange={(e) => setQuickNoteDraft(e.target.value.slice(0, MAX_QUICK_NOTE_LENGTH))}
                                onKeyDown={(e) => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleQuickNoteSave();
                                    }
                                }}
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                                placeholder="Ghi chú nhanh..."
                            />
                            <div className="mt-2 flex justify-end gap-2">
                                <button
                                    className="rounded border border-slate-300 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                                    disabled={quickNoteSaving}
                                    onClick={() => {
                                        setQuickNoteDraft(activeNoteOriginal);
                                        setIsQuickNoteEditing(false);
                                    }}
                                >
                                    Huỷ
                                </button>
                                <button
                                    className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                                    disabled={!isQuickNoteDirty || quickNoteSaving}
                                    onClick={() => { void handleQuickNoteSave(); }}
                                >
                                    {quickNoteSaving ? 'Đang lưu...' : 'Lưu'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p
                            className="text-[11px] text-slate-600 break-words leading-relaxed"
                            style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 4,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {activeNoteText || 'Chưa có note.'}
                        </p>
                    )}
                </div>
            )}

            {activeImagePreviewId && activeImagePreviewImage && (
                <div className="fixed inset-0 z-[70] flex" role="dialog" aria-modal="true">
                    <button
                        type="button"
                        aria-label="Đóng xem ảnh"
                        className="flex-1 bg-black/35"
                        onClick={() => {
                            setActiveImagePreviewId(null);
                            setActiveImagePreviewIndex(0);
                        }}
                    />
                    <aside className="h-full w-[min(96vw,980px)] border-l border-gray-200 bg-white shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">Image Preview</p>
                                <p className="truncate text-xs text-gray-500">{activeImagePreviewName}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                {activeImagePreviewImages.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            aria-label="Ảnh trước"
                                            className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800"
                                            onClick={showPrevPreviewImage}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Ảnh kế"
                                            className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800"
                                            onClick={showNextPreviewImage}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    aria-label="Đóng xem ảnh"
                                    className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800"
                                    onClick={() => {
                                        setActiveImagePreviewId(null);
                                        setActiveImagePreviewIndex(0);
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 bg-slate-50 p-4">
                            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(200px,24vw,280px)] gap-3">
                                <div className="min-h-0 rounded-lg border border-slate-200 bg-white p-2 flex flex-col">
                                    <div className="min-h-0 flex-1">
                                        <img
                                            src={activeImagePreviewImage.url}
                                            alt={activeImagePreviewName}
                                            className="h-full w-full object-contain"
                                        />
                                    </div>
                                    {activeImagePreviewImages.length > 1 && (
                                        <div className="mt-2 border-t border-slate-200 pt-2">
                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                {activeImagePreviewImages.map((image, index) => {
                                                    const isActive = index === normalizedActiveImagePreviewIndex;
                                                    return (
                                                        <button
                                                            key={image.id}
                                                            type="button"
                                                            className={`shrink-0 overflow-hidden rounded border ${isActive ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}`}
                                                            onClick={() => setActiveImagePreviewIndex(index)}
                                                            title={image.name || `Ảnh ${index + 1}`}
                                                        >
                                                            <img
                                                                src={image.url}
                                                                alt={image.name || `Ảnh ${index + 1}`}
                                                                className="h-16 w-24 object-cover"
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <section className="min-h-0 rounded-lg border border-slate-200 bg-white flex flex-col">
                                    <div className="border-b border-slate-200 px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Note</p>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                                        <p className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                                            {activeImagePreviewNote || 'Chưa có note.'}
                                        </p>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
