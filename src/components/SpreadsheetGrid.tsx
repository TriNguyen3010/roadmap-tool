'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { RoadmapDocument, RoadmapItem, ItemType, Milestone, SubcategoryType, ItemPriority, PRIORITY_LEVELS } from '@/types/roadmap';
import {
    flattenRoadmap, calculateProgress, FlattenedItem,
    generateTimelineDays, updateNodeById, deleteNodeById, addChildToNode, reorderItems
} from '@/utils/roadmapHelpers';
import { format, isSameDay, differenceInDays, startOfDay, isWithinInterval, parseISO } from 'date-fns';
import { ChevronRight, ChevronDown, Pencil, Trash2, PlusCircle } from 'lucide-react';
import EditPopup from './EditPopup';
import AddNodePopup from './AddNodePopup';

interface GridProps {
    data: RoadmapDocument;
    onDataChange: (newData: RoadmapDocument, shouldSave?: boolean) => void;
    onRootAdd: (newItem: RoadmapItem) => void;
    showConfirm: (message: string) => Promise<boolean>;
    viewStart: string;
    viewEnd: string;
    today: Date;
    // Column visibility (lifted to parent for persistence)
    showPct: boolean;
    setShowPct: (v: boolean) => void;
    showPriority: boolean;
    setShowPriority: (v: boolean) => void;
    showStartDate: boolean;
    setShowStartDate: (v: boolean) => void;
    showEndDate: boolean;
    setShowEndDate: (v: boolean) => void;
}

const ROW_HEIGHT = 28;
const COL_W = 26;
const MILESTONE_HEADER_H = 22;

// Fixed column widths (only ID and Actions are truly fixed)
const COL_ID_W = 52;
const COL_ACTIONS_W = 52;
const COL_STATUS_DEFAULT = 110;
const COL_DATE_DEFAULT = 85;
const COL_PCT_W = 56; // fixed, but can be hidden
const GAP_H = 8;       // height of hidden-row gap indicator

// Gap render entry type
type RenderEntry =
    | { kind: 'row'; row: FlattenedItem }
    | { kind: 'gap'; ids: string[]; names: string[] };

const DEPTH_STYLES: { bg: string; font: string }[] = [
    { bg: '#c6d3ea', font: 'bold' },     // Level 0 (category)
    { bg: '#d4e4c8', font: 'bold' },     // Level 1 (subcategory)
    { bg: '#e8e8e8', font: 'bold' },     // Level 2 (group)
    { bg: '#ffffff', font: 'normal' },   // Level 3 (feature)
    { bg: '#f9fafb', font: 'normal' },   // Level 4/5 (team styles fallback)
];

const STATUS_BAR_COLOR: Record<string, string> = {
    'Done': '#22c55e',
    'In Progress': '#3b82f6',
    'Not Started': '#9ca3af',
};

const STATUS_TAG_BG: Record<string, string> = {
    'Done': '#bbf7d0',
    'In Progress': '#bfdbfe',
    'Not Started': '#f3f4f6',
};
const STATUS_TAG_TEXT: Record<string, string> = {
    'Done': '#166534',
    'In Progress': '#1e40af',
    'Not Started': '#374151',
};

const PRIORITY_TAG_BG: Record<string, string> = {
    'High': '#fee2e2',
    'Medium': '#fef9c3',
    'Low': '#dcfce7',
};
const PRIORITY_TAG_TEXT: Record<string, string> = {
    'High': '#b91c1c',
    'Medium': '#854d0e',
    'Low': '#166534',
};
const COL_PRIORITY_W = 70;

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

export default function SpreadsheetGrid({ data, onDataChange, onRootAdd, showConfirm, viewStart, viewEnd, today,
    showPct, setShowPct, showPriority, setShowPriority, showStartDate, setShowStartDate, showEndDate, setShowEndDate
}: GridProps) {
    const leftPaneRef = useRef<HTMLDivElement>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);

    // ── Column widths (resizable) ──
    const [nameW, setNameW] = useState(260);
    const [statusW, setStatusW] = useState(COL_STATUS_DEFAULT);
    const [startDateW, setStartDateW] = useState(COL_DATE_DEFAULT);
    const [endDateW, setEndDateW] = useState(COL_DATE_DEFAULT);

    // ── Priority dropdown open state ──
    const [openPriorityId, setOpenPriorityId] = useState<string | null>(null);

    // ── CRUD states ──
    const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
    const [addingToParent, setAddingToParent] = useState<{ id: string; name: string; childType: ItemType } | null>(null);

    // ── Drag & Drop States ──
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    // ── Expand all by default ──
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const ids = new Set<string>();
        const collect = (items: RoadmapItem[]) => {
            for (const item of items) {
                if (item.children?.length) { ids.add(item.id); collect(item.children); }
            }
        };
        collect(data.items);
        return ids;
    });

    const handleScrollLeft = (e: React.UIEvent<HTMLDivElement>) => { if (rightPaneRef.current) rightPaneRef.current.scrollTop = e.currentTarget.scrollTop; };
    const handleScrollRight = (e: React.UIEvent<HTMLDivElement>) => { if (leftPaneRef.current) leftPaneRef.current.scrollTop = e.currentTarget.scrollTop; };

    // ── Individual row hide (leaf rows only) ──
    const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
    const toggleHideRow = (id: string) => {
        setHiddenRowIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const calculatedItems = useMemo(() => calculateProgress(data.items), [data.items]);
    const flattened: FlattenedItem[] = useMemo(() => {
        const raw = flattenRoadmap(calculatedItems);
        return raw.filter(item => !item.parentIds.some(pid => !expandedIds.has(pid)));
    }, [calculatedItems, expandedIds]);

    // Tự động căn chỉnh độ rộng cột FEATURES theo nội dung hiển thị (có giới hạn min max)
    useEffect(() => {
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
    }, [flattened]);


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
    const todayIndex = today ? timelineDays.findIndex(d => isSameDay(d, today)) : -1;

    const weekGroups = useMemo(() => {
        const groups: { label: string; days: Date[] }[] = [];
        let cur: { label: string; wk: string; days: Date[] } | null = null;
        for (const day of timelineDays) {
            const wk = format(day, 'yyyy-ww');
            if (!cur || cur.wk !== wk) {
                if (cur) groups.push({ label: cur.label, days: cur.days });
                cur = { label: `W${format(day, 'ww')} · ${format(day, 'MMM d')}`, wk, days: [day] };
            } else { cur.days.push(day); }
        }
        if (cur) groups.push({ label: cur.label, days: cur.days });
        return groups;
    }, [timelineDays]);

    const milestones: Milestone[] = data.milestones || [];
    const milestoneRanges = useMemo(() => milestones.map(m => {
        const startIdx = timelineDays.findIndex(d => isSameDay(d, parseISO(m.startDate)));
        const endIdx = timelineDays.findIndex(d => isSameDay(d, parseISO(m.endDate)));
        if (startIdx < 0) return null;
        const actualEnd = endIdx >= 0 ? endIdx : startIdx;
        return { ...m, left: startIdx * COL_W, width: (actualEnd - startIdx + 1) * COL_W };
    }).filter(Boolean) as (Milestone & { left: number; width: number })[], [milestones, timelineDays]);

    // ── CRUD handlers ──
    const handleEditSave = (updated: RoadmapItem) => {
        onDataChange({ ...data, items: updateNodeById(data.items, updated.id, updated) });
        if (updated.children && updated.children.length > 0) {
            setExpandedIds(prev => new Set([...prev, updated.id]));
        }
    };
    const handleDelete = async (id: string) => {
        if (!(await showConfirm('Bạn có chắc muốn xoá mục này và toàn bộ nội dung con của nó không?'))) return;
        onDataChange({ ...data, items: deleteNodeById(data.items, id) });
    };
    const handleAddChild = (parentId: string, newItem: RoadmapItem) => {
        if (parentId === '__ROOT__') { onRootAdd(newItem); return; }
        const newItems = addChildToNode(data.items, parentId, newItem);

        const nextExp = new Set([...expandedIds, parentId]);
        if (newItem.children && newItem.children.length > 0) {
            nextExp.add(newItem.id);
        }

        setExpandedIds(nextExp);
        onDataChange({ ...data, items: newItems });
    };

    // ── Drag & Drop Handlers ──
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        // Setting transparent image helps styling custom drag ghost if needed
    };
    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault(); // enable drop
        if (draggedId && draggedId !== id) {
            setDragOverId(id);
        }
    };
    const handleDragLeave = () => {
        setDragOverId(null);
    };
    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (draggedId && draggedId !== targetId) {
            const newItems = reorderItems(data.items, draggedId, targetId);
            onDataChange({ ...data, items: newItems }, true); // Pass true to trigger auto-save if supported
        }
        setDraggedId(null);
        setDragOverId(null);
    };
    const handleDragEnd = () => {
        setDraggedId(null);
        setDragOverId(null);
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
        + (showStartDate ? startDateW : 0)
        + (showEndDate ? endDateW : 0)
        + (showPct ? COL_PCT_W : 0)
        + COL_ACTIONS_W;
    const TOTAL_HEADER_H = MILESTONE_HEADER_H + ROW_HEIGHT + ROW_HEIGHT;

    // Grid template for left pane rows/header
    const gridTemplate = `${COL_ID_W}px ${nameW}px`
        + (showPriority ? ` ${COL_PRIORITY_W}px` : '')
        + ` ${statusW}px`
        + (showStartDate ? ` ${startDateW}px` : '')
        + (showEndDate ? ` ${endDateW}px` : '')
        + (showPct ? ` ${COL_PCT_W}px` : '')
        + ` ${COL_ACTIONS_W}px`;

    return (
        <div className="flex h-full w-full bg-white overflow-hidden text-[12px] text-gray-900 font-sans">
            {editingItem && <EditPopup item={editingItem} onSave={handleEditSave} onClose={() => setEditingItem(null)} />}
            {addingToParent && (
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
                            onMouseDown={e => startResize(e, setNameW, 120)}
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

                    {/* % column – click header to hide */}
                    {showPct && (
                        <div
                            className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột %"
                            onClick={() => setShowPct(false)}
                        >
                            <span className="text-indigo-700">%</span>
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
                        {!showPct && (
                            <button title="Hiện lại cột %" onClick={() => setShowPct(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                %
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

                        const isCategory = row.type === 'category';
                        const isDragged = isCategory && draggedId === row.id;
                        const isDragOver = isCategory && dragOverId === row.id;

                        return (
                            <div key={row.id}
                                className={`grid border-b border-gray-300 group hover:brightness-95 ${isDragged ? 'opacity-30' : ''} ${isDragOver ? 'border-t-4 border-t-blue-500' : ''}`}
                                style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT, backgroundColor: style.bg }}
                                draggable={isCategory}
                                onDragStart={(e) => isCategory && handleDragStart(e, row.id)}
                                onDragOver={(e) => isCategory && handleDragOver(e, row.id)}
                                onDragLeave={isCategory ? handleDragLeave : undefined}
                                onDrop={(e) => isCategory && handleDrop(e, row.id)}
                                onDragEnd={isCategory ? handleDragEnd : undefined}
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
                                    onClick={() => hasChildren && toggleExpand(row.id)}
                                >
                                    {hasChildren
                                        ? (isExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />)
                                        : <span className="w-[14px] shrink-0" />}
                                    <span className="truncate">{row.name}</span>
                                    {row.type === 'subcategory' && row.subcategoryType && (
                                        <span
                                            className="ml-1 shrink-0 text-[9px] px-1.5 py-0 rounded-full font-bold whitespace-nowrap"
                                            style={{ backgroundColor: SUB_TYPE_STYLE[row.subcategoryType].bg, color: SUB_TYPE_STYLE[row.subcategoryType].text }}
                                        >
                                            {row.subcategoryType}
                                        </span>
                                    )}
                                </div>

                                {/* Priority — only for group/feature, hidden when showPriority=false */}
                                {showPriority && (
                                    (row.type === 'group' || row.type === 'feature') ? (
                                        <div
                                            className="flex items-center justify-center border-r border-gray-300 px-1 cursor-pointer hover:bg-black/5 transition-colors relative"
                                            style={{ width: COL_PRIORITY_W }}
                                            title="Click để đổi priority"
                                            onClick={e => { e.stopPropagation(); setOpenPriorityId(openPriorityId === row.id ? null : row.id); }}
                                        >
                                            <span
                                                className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                                style={{
                                                    backgroundColor: row.priority ? PRIORITY_TAG_BG[row.priority] : '#f3f4f6',
                                                    color: row.priority ? PRIORITY_TAG_TEXT[row.priority] : '#9ca3af'
                                                }}
                                            >
                                                {row.priority ?? '—'}
                                            </span>
                                            {openPriorityId === row.id && (
                                                <div className="absolute bottom-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg flex flex-col min-w-[90px]">
                                                    {PRIORITY_LEVELS.map(p => {
                                                        const dropdownColor: Record<string, string> = { High: '#dc2626', Medium: '#d97706', Low: '#16a34a' };
                                                        return (
                                                            <button key={p} className="text-left text-[11px] px-3 py-1.5 font-bold hover:bg-gray-50 transition-colors"
                                                                style={{ color: dropdownColor[p] }}
                                                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDataChange({ ...data, items: updateNodeById(data.items, row.id, { ...row, priority: p }) }); setOpenPriorityId(null); }}
                                                            >{p}</button>
                                                        );
                                                    })}
                                                    <button className="text-left text-[11px] px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                                        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); const { priority: _, ...rest } = row; onDataChange({ ...data, items: updateNodeById(data.items, row.id, rest as RoadmapItem) }); setOpenPriorityId(null); }}
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
                                    onClick={() => setEditingItem(row)}
                                    title="Click để sửa"
                                >
                                    <span className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                        style={{ backgroundColor: STATUS_TAG_BG[row.status] || '#f3f4f6', color: STATUS_TAG_TEXT[row.status] || '#374151' }}>
                                        {row.status}
                                    </span>
                                </div>

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

                                {/* Progress */}
                                {showPct && (
                                    <div className="flex items-center justify-center font-bold text-[11px] border-r border-gray-300 cursor-pointer hover:brightness-95 transition-all"
                                        style={{ backgroundColor: row.progress === 100 ? '#bbf7d0' : row.progress > 0 ? '#fef08a' : 'transparent' }}
                                        onClick={() => setEditingItem(row)}
                                        title="Click để sửa"
                                    >
                                        {row.progress}%
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button title="Sửa" className="text-blue-500 hover:text-blue-700" onClick={() => setEditingItem(row)}><Pencil size={12} /></button>
                                    {childType && (
                                        <button title={`Thêm ${childType}`} className="text-green-600 hover:text-green-800"
                                            onClick={() => setAddingToParent({ id: row.id, name: row.name, childType })}>
                                            <PlusCircle size={12} />
                                        </button>
                                    )}
                                    <button title="Xoá" className="text-red-400 hover:text-red-600" onClick={() => handleDelete(row.id)}><Trash2 size={12} /></button>
                                </div>
                            </div>
                        );
                    })}
                    <div className="p-2">
                        <button className="text-xs text-green-700 hover:text-green-900 flex items-center gap-1 font-semibold"
                            onClick={() => setAddingToParent({ id: '__ROOT__', name: 'Roadmap', childType: 'category' })}>
                            <PlusCircle size={13} /> Thêm Category
                        </button>
                    </div>
                </div>
            </div>

            {/* ── RIGHT PANE – GANTT ── */}
            <div ref={rightPaneRef} className="flex-1 overflow-auto relative" onScroll={handleScrollRight}>
                <div style={{ width: timelineDays.length * COL_W, minWidth: '100%' }}>

                    {/* ── STICKY HEADER ── */}
                    <div className="sticky top-0 z-20 flex flex-col" style={{ height: TOTAL_HEADER_H }}>

                        {/* Row 0: Milestone labels */}
                        <div className="relative flex border-b border-gray-300 bg-white shrink-0 overflow-hidden" style={{ height: MILESTONE_HEADER_H }}>
                            {timelineDays.map((_, i) => <div key={i} className="shrink-0" style={{ width: COL_W }} />)}
                            {milestoneRanges.map((m) => (
                                <div key={m.id} className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1"
                                    style={{ left: m.left, width: m.width, backgroundColor: m.color }} title={m.label}>
                                    {m.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 1: Week groups */}
                        <div className="relative flex border-b border-gray-400 bg-gray-200 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {weekGroups.map((wk, i) => (
                                <div key={i} className="shrink-0 border-r border-gray-400 flex items-center px-1 text-[10px] font-bold text-gray-700 overflow-hidden"
                                    style={{ width: wk.days.length * COL_W }}>
                                    {wk.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 2: Days */}
                        <div className="relative flex border-b-2 border-gray-500 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {timelineDays.map((day, idx) => {
                                const isToday = today ? isSameDay(day, today) : false;
                                const dow = day.getDay();
                                const isWeekend = dow === 0 || dow === 6;
                                const isMilestoneDay = milestoneRanges.some(m => isWithinInterval(day, { start: parseISO(m.startDate), end: parseISO(m.endDate) }));
                                const milestoneBg = isMilestoneDay
                                    ? milestoneRanges.find(m => isWithinInterval(day, { start: parseISO(m.startDate), end: parseISO(m.endDate) }))!.color
                                    : undefined;

                                let bg = '#f1f5f9';
                                let textColor = '#64748b';
                                let fontWeight: 'normal' | 'bold' = 'normal';
                                if (isToday) { bg = '#fef08a'; textColor = '#92400e'; fontWeight = 'bold'; }
                                else if (isMilestoneDay && milestoneBg) { bg = hexToRgba(milestoneBg, 0.3); textColor = milestoneBg; fontWeight = 'bold'; }
                                else if (isWeekend) { bg = '#ede9fe'; textColor = '#7c3aed'; }

                                return (
                                    <div key={idx} className="shrink-0 flex flex-col items-center justify-center border-r border-gray-300 text-[9px]"
                                        style={{ width: COL_W, backgroundColor: bg, fontWeight, color: textColor }}>
                                        <div className="uppercase">{dow === 6 ? 'Sa' : dow === 0 ? 'Su' : format(day, 'EEE')[0]}</div>
                                        <div>{format(day, 'd')}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── DATA ROWS ── */}
                    <div className="relative group/gantt">
                        {/* Today line */}
                        {today && todayIndex >= 0 && (
                            <div className="absolute top-0 bottom-0 z-10 pointer-events-none"
                                style={{ left: todayIndex * COL_W + COL_W / 2, width: 2, backgroundColor: '#ef4444' }} />
                        )}

                        {/* Milestone column shading */}
                        {milestoneRanges.map(m => (
                            <div key={m.id} className="absolute top-0 bottom-0 pointer-events-none z-[2]"
                                style={{ left: m.left, width: m.width, backgroundColor: hexToRgba(m.color, 0.12) }} />
                        ))}

                        {/* Weekend shading */}
                        <div className="absolute inset-0 flex pointer-events-none">
                            {timelineDays.map((d, i) => {
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                return <div key={i} className="shrink-0 border-r border-gray-100 h-full"
                                    style={{ width: COL_W, backgroundColor: isWeekend ? 'rgba(139,92,246,0.09)' : 'transparent' }} />;
                            })}
                        </div>

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
                                const sd = new Date(row.startDate!), ed = new Date(row.endDate!);
                                const si = timelineDays.findIndex(d => isSameDay(d, sd));
                                if (si >= 0) {
                                    const calendarDays = differenceInDays(ed, sd) + 1;
                                    barLeft = si * COL_W;
                                    barWidth = calendarDays * COL_W;
                                    workdays = countWorkdays(sd, ed);

                                    const sprintsNum = calendarDays / 14;
                                    sprintStr = Number.isInteger(sprintsNum) ? sprintsNum.toString() : sprintsNum.toFixed(1);
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

                            return (
                                <div key={row.id} className="flex relative border-b border-gray-200"
                                    style={{ height: ROW_HEIGHT, backgroundColor: depthStyle.bg }}>
                                    {barLeft >= 0 && (
                                        <div
                                            className="absolute top-[4px] bottom-[4px] rounded shadow-sm z-[5] cursor-pointer transition-all flex items-center justify-center hover:z-20 group-hover/gantt:z-10"
                                            style={barStyle}
                                            title={`${row.name}: ${row.startDate} → ${row.endDate} | ${sprintStr} sprint | ${workdays} ngày làm việc | ${row.status} ${row.progress}%`}
                                            onClick={() => setEditingItem(row)}
                                        >
                                            {isGrowthCamp && <span className="absolute left-1 text-[10px]">🚀</span>}
                                            <span className="absolute z-10 opacity-0 group-hover/gantt:opacity-100 transition-opacity bg-gray-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap select-none flex items-center pointer-events-none shadow-md">
                                                {workdays}d ({sprintStr} sprints)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
