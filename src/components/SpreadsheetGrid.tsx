'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    ColumnWidthMode,
    GROUP_ITEM_TYPE_OPTIONS,
    GroupItemType,
    ItemImage,
    ItemType,
    Milestone,
    PhaseOption,
    PRIORITY_LEVELS,
    RoadmapDocument,
    RoadmapItem,
    DEFAULT_ROADMAP_CONFIG,
    SubcategoryType,
    TimelineMode,
    normalizeWeekColor,
    normalizeWeekLabel,
    normalizeItemImages,
    normalizeItemPriority,
    normalizePhaseIds
} from '@/types/roadmap';
import {
    FlattenedItem, findNodeById, filterRoadmapTree, flattenRoadmap, getExpandedFlattenedRows,
    generateTimelineDays, updateNodeById, deleteNodeById, addChildToNode, reorderItems, touchItemTimestamp, moveNodeToParent
} from '@/utils/roadmapHelpers';
import type { EditPermission, ManagerFieldChange, SessionUser } from '@/types/auth';
import { isAdminLevel } from '@/types/auth';
import { getEditPermission } from '@/utils/permissions';
import type { ItemStatus, TeamRole } from '@/types/roadmap';
import { resolveReportedImageReviewMainState } from '@/utils/reportedImageReviewStates';
import { calcLayeredArcHeight, sortArcsByWidth } from '@/utils/timelineArc';
import { formatWorkdayDuration } from '@/utils/workdayFormat';
import { format, differenceInDays, parseISO, endOfWeek, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronDown, Pencil, Trash2, PlusCircle, MessageSquare, ExternalLink, Image as ImageIcon, X } from 'lucide-react';
import EditPopup from './EditPopup';
import AddNodePopup from './AddNodePopup';
import DateMiniPopup from './DateMiniPopup';
import TimelineArc from './TimelineArc';

interface GridProps {
    data: RoadmapDocument;
    reportedData?: RoadmapDocument | null;
    reportedBridgeReadOnly?: boolean;
    reportedBridgeLoading?: boolean;
    reportedBridgeError?: string | null;
    reportedBridgeLabel?: string | null;
    onDataChange: (newData: RoadmapDocument, shouldSave?: boolean) => void;
    onRootAdd: (newItem: RoadmapItem) => void;
    showConfirm: (message: string) => Promise<boolean>;
    viewStart: string;
    viewEnd: string;
    timelineMode: TimelineMode;
    timelineOnly: boolean;
    timelineTaskW: number;
    setTimelineTaskW: (v: number | ((prev: number) => number)) => void;
    today: Date;
    filterCategory: string[];
    filterStatus: string[];
    filterTeam: string[];
    filterPriority: string[];
    filterPhase: string[];
    filterSubcategory: string[];
    filterGroupItemType: string[];
    reportedMode: boolean;
    isSaving: boolean;
    saveState: 'idle' | 'success' | 'error';
    saveTick: number;
    currentUser: SessionUser | null;
    documentPermission: EditPermission;
    roadmapConfig?: import('@/types/roadmap').RoadmapConfig;
    onManagerFieldChanges: (changes: ManagerFieldChange[], optimisticData: RoadmapDocument) => Promise<void> | void;
    // Column visibility (lifted to parent for persistence)
    showWorkType: boolean;
    setShowWorkType: (v: boolean) => void;
    showPriority: boolean;
    setShowPriority: (v: boolean) => void;
    showVersion: boolean;
    setShowVersion: (v: boolean) => void;
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
    addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const NO_EDIT_PERMISSION: EditPermission = {
    canEditStatus: false,
    canEditDates: false,
    canEditNotes: false,
    canEditStructure: false,
    canEditMilestones: false,
    canManageRoadmap: false,
};

const EMPTY_REPORTED_DOCUMENT: RoadmapDocument = {
    releaseName: '',
    startDate: '',
    endDate: '',
    milestones: [],
    items: [],
};

const ROW_HEIGHT = 28;
const COL_W = 18;
const MILESTONE_HEADER_H = 22;

// Fixed column widths (only ID and Actions are truly fixed)
const COL_ID_W = 52;
const COL_ACTIONS_W = 52;
const COL_STATUS_DEFAULT = 150;
const COL_PHASE_MIN = 90;
const COL_PHASE_DEFAULT = 120;
const COL_PHASE_MAX = 320;
const COL_DATE_DEFAULT = 85;
const GAP_H = 8;       // height of hidden-row gap indicator
const MIN_TIMELINE_TASK_W = 140;
const MAX_TIMELINE_TASK_W = 420;
// Gap render entry type
type RenderEntry =
    | { kind: 'row'; row: FlattenedItem }
    | { kind: 'gap'; ids: string[]; names: string[] };

type ReportedReviewCard = {
    row: FlattenedItem;
    categoryName: string;
    subcategoryName?: string;
    phaseSummary: string;
    images: ItemImage[];
};

type ReportedCategoryStat = {
    name: string;
    reportedCount: number;
    withImageCount: number;
    withoutImageCount: number;
};

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
    { bg: '#ffffff', font: 'bold' },     // Level 1 (subcategory)
    { bg: '#ffffff', font: 'bold' },     // Level 2 (group)
    { bg: '#e8e8e8ca', font: 'normal' },   // Level 3 (item)
    { bg: '#f9fafb', font: 'normal' },   // Level 4/5 (team styles fallback)
];

const STATUS_BAR_COLOR: Record<string, string> = {
  'Not Started':       '#9ca3af',
  'Sếp Vinh':          '#f43f5e',
  // BA — yellow
  'BA Handle':         '#fbbf24',
  'BA in progress':          '#f59e0b',
  'BA Done':           '#d97706',
  // PD — pink
  'PD Handle':         '#f472b6',
  'PD in progress UI/UX':    '#ec4899',
  'PD in progress Visual':   '#db2777',
  'PD Done UI/UX':     '#be185d',
  'PD Done Visual':    '#9d174d',
  // DevOps — red
  'DevOps Handle':     '#f87171',
  'DevOps in progress':      '#ef4444',
  'DevOps Done':       '#dc2626',
  // FE — purple
  'FE Handle':         '#a78bfa',
  'FE in progress':          '#8b5cf6',
  'FE Done':           '#7c3aed',
  // BE — blue
  'BE Handle':         '#60a5fa',
  'BE in progress':          '#3b82f6',
  'BE Done':           '#2563eb',
  // QC — green
  'QC Handle':         '#4ade80',
  'QC in progress':          '#22c55e',
  'QC Done - Staging': '#16a34a',
  'QC Done - Pro':     '#15803d',
  // Growth
  'Growth Handle':     '#fb923c',
  'Growth in progress':      '#f97316',
  'Growth Done':       '#ea580c',
  // Generic
  'Task To do':             '#94a3b8',
  'Task In progress':       '#3b82f6',
  'Task Pending':           '#f59e0b',
  'Task Done':         '#22c55e',
  // BD / sales pipeline
  'Contacted':                   '#38bdf8',
  'Discussing':                  '#3b82f6',
  'In progress':                 '#2563eb',
  'Pending => Data comeback':    '#f59e0b',
  'No response':                 '#94a3b8',
  'Not interested':              '#f87171',
  'Drop':                        '#b91c1c',
  'Received docs':               '#fb923c',
  'Tech check':                  '#f97316',
  'Sent proposal':               '#a78bfa',
  'Agreement review':            '#8b5cf6',
  'Agreement signed':            '#7c3aed',
  'Integration':                 '#14b8a6',
  'Testing - Post integration':  '#0d9488',
  'Sent invoice':                '#6366f1',
  'Received fund':               '#10b981',
  'Dealt':                       '#059669',
  'Done':                        '#047857',
};

const STATUS_TAG_BG: Record<string, string> = {
  'Not Started':       '#f3f4f6',
  'Sếp Vinh':          '#ffe4e6',
  // BA — yellow
  'BA Handle':         '#fef3c7',
  'BA in progress':          '#fde68a',
  'BA Done':           '#fcd34d',
  // PD — pink
  'PD Handle':         '#fce7f3',
  'PD in progress UI/UX':    '#fbcfe8',
  'PD in progress Visual':   '#f9a8d4',
  'PD Done UI/UX':     '#f472b6',
  'PD Done Visual':    '#ec4899',
  // DevOps — red
  'DevOps Handle':     '#fee2e2',
  'DevOps in progress':      '#fecaca',
  'DevOps Done':       '#fca5a5',
  // FE — purple
  'FE Handle':         '#ede9fe',
  'FE in progress':          '#ddd6fe',
  'FE Done':           '#c4b5fd',
  // BE — blue
  'BE Handle':         '#dbeafe',
  'BE in progress':          '#bfdbfe',
  'BE Done':           '#93c5fd',
  // QC — green
  'QC Handle':         '#dcfce7',
  'QC in progress':          '#bbf7d0',
  'QC Done - Staging': '#86efac',
  'QC Done - Pro':     '#4ade80',
  // Growth — orange
  'Growth Handle':     '#ffedd5',
  'Growth in progress':      '#fed7aa',
  'Growth Done':       '#fdba74',
  // Generic
  'Task To do':             '#f1f5f9',
  'Task In progress':       '#dbeafe',
  'Task Pending':           '#fef3c7',
  'Task Done':         '#dcfce7',
  // BD / sales pipeline
  'Contacted':                   '#e0f2fe',
  'Discussing':                  '#dbeafe',
  'In progress':                 '#bfdbfe',
  'Pending => Data comeback':    '#fef3c7',
  'No response':                 '#f1f5f9',
  'Not interested':              '#fee2e2',
  'Drop':                        '#fecaca',
  'Received docs':               '#ffedd5',
  'Tech check':                  '#fed7aa',
  'Sent proposal':               '#ede9fe',
  'Agreement review':            '#ddd6fe',
  'Agreement signed':            '#c4b5fd',
  'Integration':                 '#ccfbf1',
  'Testing - Post integration':  '#99f6e4',
  'Sent invoice':                '#e0e7ff',
  'Received fund':               '#d1fae5',
  'Dealt':                       '#a7f3d0',
  'Done':                        '#6ee7b7',
};
const STATUS_TAG_TEXT: Record<string, string> = {
  'Not Started':       '#374151',
  'Sếp Vinh':          '#9f1239',
  // BA — yellow
  'BA Handle':         '#92400e',
  'BA in progress':          '#78350f',
  'BA Done':           '#713f12',
  // PD — pink
  'PD Handle':         '#9d174d',
  'PD in progress UI/UX':    '#831843',
  'PD in progress Visual':   '#701a75',
  'PD Done UI/UX':     '#4a044e',
  'PD Done Visual':    '#4a044e',
  // DevOps — red
  'DevOps Handle':     '#991b1b',
  'DevOps in progress':      '#7f1d1d',
  'DevOps Done':       '#7f1d1d',
  // FE — purple
  'FE Handle':         '#6d28d9',
  'FE in progress':          '#5b21b6',
  'FE Done':           '#4c1d95',
  // BE — blue
  'BE Handle':         '#1d4ed8',
  'BE in progress':          '#1e40af',
  'BE Done':           '#1e3a8a',
  // QC — green
  'QC Handle':         '#166534',
  'QC in progress':          '#14532d',
  'QC Done - Staging': '#14532d',
  'QC Done - Pro':     '#064e3b',
  // Growth — orange
  'Growth Handle':     '#9a3412',
  'Growth in progress':      '#7c2d12',
  'Growth Done':       '#7c2d12',
  // Generic
  'Task To do':             '#475569',
  'Task In progress':       '#1e40af',
  'Task Pending':           '#92400e',
  'Task Done':         '#166534',
  // BD / sales pipeline
  'Contacted':                   '#075985',
  'Discussing':                  '#1d4ed8',
  'In progress':                 '#1e40af',
  'Pending => Data comeback':    '#92400e',
  'No response':                 '#64748b',
  'Not interested':              '#b91c1c',
  'Drop':                        '#7f1d1d',
  'Received docs':               '#9a3412',
  'Tech check':                  '#7c2d12',
  'Sent proposal':               '#5b21b6',
  'Agreement review':            '#4c1d95',
  'Agreement signed':            '#3730a3',
  'Integration':                 '#0f766e',
  'Testing - Post integration':  '#115e59',
  'Sent invoice':                '#3730a3',
  'Received fund':               '#065f46',
  'Dealt':                       '#064e3b',
  'Done':                        '#022c22',
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
function getStatusOptionsForRow(
    row: { type: string; teamRole?: string },
    config: import('@/types/roadmap').RoadmapConfig
): ItemStatus[] {
    if (row.type === 'team' && row.teamRole) {
        const teamStatuses = config.teamStatuses[row.teamRole];
        if (teamStatuses) return ['None', 'Not Started', ...teamStatuses] as ItemStatus[];
    }
    return ['None', ...config.taskStatuses] as ItemStatus[];
}

const COL_WORK_TYPE_W = 110;
const COL_PRIORITY_W = 70;
const COL_VERSION_W = 80;
const MAX_QUICK_NOTE_LENGTH = 500;

const CHILD_TYPE_MAP: Record<ItemType, ItemType | null> = {
    category: 'subcategory',
    subcategory: 'group',
    group: 'item',
    item: null,
    team: null,
};

// Subcategory type badge styles
const SUB_TYPE_STYLE: Record<SubcategoryType, { bg: string; text: string }> = {
    'Feature': { bg: '#dbeafe', text: '#1d4ed8' },
    'Bug': { bg: '#fee2e2', text: '#b91c1c' },
    'Growth Camp': { bg: '#d1fae5', text: '#065f46' },
};

const GROUP_ITEM_TYPE_STYLE: Record<GroupItemType, { bg: string; text: string }> = {
    'Feature': { bg: '#dbeafe', text: '#1d4ed8' },
    'Improvement': { bg: '#fef3c7', text: '#92400e' },
    'Bug': { bg: '#fee2e2', text: '#b91c1c' },
    'Growth Camp': { bg: '#d1fae5', text: '#065f46' },
};

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function getRowBg(depthBg: string, rowPhaseIds: string[], phaseColorById: Map<string, string>): string {
    if (rowPhaseIds.length === 0) return depthBg;
    const firstColor = phaseColorById.get(rowPhaseIds[0]);
    if (!firstColor) return depthBg;
    return hexToRgba(firstColor, 0.18);
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

/** Arc endpoints always sit at the center of the boundary day cell. */
function getArcEndpointPadding(spanWidth: number, unitWidth: number): number {
    // For single-day bars (spanWidth === unitWidth), center = unitWidth/2
    // For multi-day bars, center of first/last unit cell = unitWidth/2
    return unitWidth / 2;
}

function estimatePhaseCellWidth(labels: string[]): number {
    if (labels.length === 0) return 28;
    return labels.reduce((sum, label) => {
        const chipW = Math.min(120, Math.max(30, label.length * 6 + 14));
        return sum + chipW;
    }, 0) + Math.max(0, labels.length - 1) * 4 + 12;
}

function getRowDisplayDepth(row: Pick<FlattenedItem, 'depth' | 'type'>): number {
    let displayDepth = row.depth;
    if (row.type === 'item') displayDepth = row.depth + 1;
    else if (row.type === 'team' && row.depth >= 4) displayDepth = row.depth + 1;
    return displayDepth;
}

export default function SpreadsheetGrid({ data, reportedData, reportedBridgeReadOnly = false, reportedBridgeLoading = false, reportedBridgeError = null, reportedBridgeLabel = null, onDataChange, onRootAdd, showConfirm, viewStart, viewEnd, today,
    timelineMode, timelineOnly, timelineTaskW, setTimelineTaskW,
    filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType, reportedMode,
    isSaving, saveState, saveTick, currentUser, documentPermission, roadmapConfig: roadmapConfigProp, onManagerFieldChanges,
    showWorkType, setShowWorkType,
    showPriority, setShowPriority, showVersion, setShowVersion, showPhase, setShowPhase, showStartDate, setShowStartDate, showEndDate, setShowEndDate,
    nameW, setNameW, nameWMode, setNameWMode,
    expandedIds, setExpandedIds, hiddenRowIds, setHiddenRowIds, addToast
}: GridProps) {
    const roadmapConfig = roadmapConfigProp ?? DEFAULT_ROADMAP_CONFIG;
    const leftPaneRef = useRef<HTMLDivElement>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);

    // ── Column widths (resizable) ──
    const [statusW, setStatusW] = useState(COL_STATUS_DEFAULT);
    const [phaseW, setPhaseW] = useState(COL_PHASE_DEFAULT);
    const [startDateW, setStartDateW] = useState(COL_DATE_DEFAULT);
    const [endDateW, setEndDateW] = useState(COL_DATE_DEFAULT);

    // ── Priority dropdown open state ──
    const [openWorkTypeId, setOpenWorkTypeId] = useState<string | null>(null);
    const [openPriorityId, setOpenPriorityId] = useState<string | null>(null);
    const [openVersionId, setOpenVersionId] = useState<string | null>(null);
    const [openStatusId, setOpenStatusId] = useState<string | null>(null);
    const [openPhaseId, setOpenPhaseId] = useState<string | null>(null);
    const [editingExtraCell, setEditingExtraCell] = useState<{ rowId: string; colKey: string; value: string } | null>(null);
    const [extraCellAnchorRect, setExtraCellAnchorRect] = useState<DOMRect | null>(null);
    const [dropdownAnchorRect, setDropdownAnchorRect] = useState<DOMRect | null>(null);
    const [activeBarInfoId, setActiveBarInfoId] = useState<string | null>(null);
    const [activeBarClickX, setActiveBarClickX] = useState<number>(0); // click X relative to bar container
    const [expandedBarIds, setExpandedBarIds] = useState<Set<string>>(new Set());
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
    const [dateMiniPopup, setDateMiniPopup] = useState<{
        itemId: string;
        field: 'startDate' | 'endDate';
        value: string | undefined;
        siblingValue: string | undefined;
        anchorRect: DOMRect;
    } | null>(null);

    const [teamRestrictionFeedback, setTeamRestrictionFeedback] = useState<{ message: string; x: number; y: number } | null>(null);
    const hideRestrictionFeedbackTimer = useRef<NodeJS.Timeout | null>(null);
    const showRestrictionFeedback = useCallback((message: string, e: React.MouseEvent) => {
        if (hideRestrictionFeedbackTimer.current) clearTimeout(hideRestrictionFeedbackTimer.current);
        setTeamRestrictionFeedback({ message, x: e.clientX, y: e.clientY });
        hideRestrictionFeedbackTimer.current = setTimeout(() => {
            setTeamRestrictionFeedback(null);
        }, 1500);
    }, []);

    // ── CRUD states ──
    const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
    const [addingToParent, setAddingToParent] = useState<{ id: string; name: string; childType: ItemType } | null>(null);

    // ── Drag & Drop States ──
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [dragOverMode, setDragOverMode] = useState<'reorder' | 'parent' | null>(null);
    const [activeNotePreview, setActiveNotePreview] = useState<{ id: string; top: number; left: number } | null>(null);
    const [activeImagePreviewId, setActiveImagePreviewId] = useState<string | null>(null);
    const [activeImagePreviewIndex, setActiveImagePreviewIndex] = useState(0);
    const [activeViewerImageHasError, setActiveViewerImageHasError] = useState(false);
    const [resumeViewerAfterEdit, setResumeViewerAfterEdit] = useState<{ itemId: string; imageIndex: number } | null>(null);
    const [reportedImageErrorKeys, setReportedImageErrorKeys] = useState<Record<string, true>>({});
    const [viewerInlineSaveFeedback, setViewerInlineSaveFeedback] = useState<{
        state: 'saving' | 'success' | 'error';
        message: string;
        startedAtSaveTick: number;
    } | null>(null);
    const isReportedReadOnly = reportedMode && reportedBridgeReadOnly;
    const viewData = isReportedReadOnly
        ? (reportedData ?? EMPTY_REPORTED_DOCUMENT)
        : (reportedMode && reportedData ? reportedData : data);
    const effectiveDocumentPermission = isReportedReadOnly ? NO_EDIT_PERMISSION : documentPermission;
    const canEditStructure = effectiveDocumentPermission.canEditStructure;
    const getRowPermission = useCallback((itemId: string): EditPermission => {
        if (isReportedReadOnly) return NO_EDIT_PERMISSION;
        return getEditPermission(currentUser, itemId, viewData.items);
    }, [currentUser, isReportedReadOnly, viewData.items]);
    const [isQuickNoteEditing, setIsQuickNoteEditing] = useState(false);
    const [quickNoteDraft, setQuickNoteDraft] = useState('');
    const [quickNoteSaving, setQuickNoteSaving] = useState(false);
    const [imagePreviewNoteDraft, setImagePreviewNoteDraft] = useState('');
    // Ephemeral review markers for groups only (UI helper, never persisted).
    // Value is marker number shown inside the circle.
    const [reviewedGroupNumberById, setReviewedGroupNumberById] = useState<Record<string, number>>({});

    const handleScrollLeft = (e: React.UIEvent<HTMLDivElement>) => {
        if (rightPaneRef.current) rightPaneRef.current.scrollTop = e.currentTarget.scrollTop;
        if (activeNotePreview) void closeQuickNotePreview();
        if (dateMiniPopup) setDateMiniPopup(null);
        if (openWorkTypeId) setOpenWorkTypeId(null);
        if (openPriorityId) setOpenPriorityId(null);
        if (openVersionId) setOpenVersionId(null);
        if (openStatusId) setOpenStatusId(null);
        if (openPhaseId) setOpenPhaseId(null);
        if (editingExtraCell) { setEditingExtraCell(null); setExtraCellAnchorRect(null); }
    };
    const handleScrollRight = (e: React.UIEvent<HTMLDivElement>) => {
        if (leftPaneRef.current) leftPaneRef.current.scrollTop = e.currentTarget.scrollTop;
        if (activeNotePreview) void closeQuickNotePreview();
        if (dateMiniPopup) setDateMiniPopup(null);
        if (openWorkTypeId) setOpenWorkTypeId(null);
        if (openPriorityId) setOpenPriorityId(null);
        if (openVersionId) setOpenVersionId(null);
        if (openStatusId) setOpenStatusId(null);
        if (openPhaseId) setOpenPhaseId(null);
        if (editingExtraCell) { setEditingExtraCell(null); setExtraCellAnchorRect(null); }
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

    /** Capture the anchor rect from the clicked cell for portal-based dropdowns. */
    const captureDropdownAnchor = (e: React.MouseEvent) => {
        setDropdownAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    };

    const phaseOptions: PhaseOption[] = useMemo(() => {
        const milestones = viewData.milestones || [];
        return milestones.map((phase, index) => {
            const id = (phase.id || '').trim() || `phase_${index + 1}`;
            const label = normalizeWeekLabel(phase.label, index);
            const hasSchedule = !!((phase.startDate || '').trim() && (phase.endDate || '').trim());
            const color = normalizeWeekColor(phase.color, index);
            return { id, label, hasSchedule, color };
        });
    }, [viewData.milestones]);

    const phaseLabelById = useMemo(() => {
        const labelMap = new Map<string, string>();
        phaseOptions.forEach(phase => labelMap.set(phase.id, phase.label));
        return labelMap;
    }, [phaseOptions]);

    const phaseShortById = useMemo(() => {
        const shortMap = new Map<string, string>();
        phaseOptions.forEach((phase, index) => shortMap.set(phase.id, `W${index + 1}`));
        return shortMap;
    }, [phaseOptions]);

    const phaseColorById = useMemo(() => {
        const colorMap = new Map<string, string>();
        phaseOptions.forEach((phase, index) => colorMap.set(phase.id, normalizeWeekColor(phase.color, index)));
        return colorMap;
    }, [phaseOptions]);

    // Collect unique versions from all items (for version dropdown)
    const allVersions: string[] = useMemo(() => {
        const versions = new Set<string>();
        const walk = (items: RoadmapItem[]) => {
            for (const item of items) {
                if (item.version) versions.add(item.version);
                if (item.children) walk(item.children);
            }
        };
        walk(data.items);
        return Array.from(versions).sort();
    }, [data.items]);

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

        viewData.items.forEach(item => {
            walk(item);
        });

        return result;
    }, [viewData.items]);

    const flattened: FlattenedItem[] = useMemo(() => {
        return getExpandedFlattenedRows(
            viewData.items,
            {
                category: filterCategory,
                status: filterStatus,
                team: filterTeam,
                priority: filterPriority,
                phase: filterPhase,
                subcategory: filterSubcategory,
                groupItemType: filterGroupItemType,
            },
            expandedIds
        );
    }, [viewData.items, filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType, expandedIds]);

    const reportedScopeRows = useMemo(() => {
        const filteredTree = filterRoadmapTree(viewData.items, {
            category: isReportedReadOnly ? [] : filterCategory,
            status: isReportedReadOnly ? [] : filterStatus,
            team: isReportedReadOnly ? [] : filterTeam,
            phase: isReportedReadOnly ? [] : filterPhase,
            subcategory: isReportedReadOnly ? [] : filterSubcategory,
            groupItemType: isReportedReadOnly ? [] : filterGroupItemType,
        });
        return flattenRoadmap(filteredTree);
    }, [viewData.items, isReportedReadOnly, filterCategory, filterStatus, filterTeam, filterPhase, filterSubcategory, filterGroupItemType]);

    const reportedScopeById = useMemo(() => {
        const map = new Map<string, FlattenedItem>();
        reportedScopeRows.forEach(row => map.set(row.id, row));
        return map;
    }, [reportedScopeRows]);

    const reportedCategoryNamesInScope = useMemo(() => {
        const names = new Set<string>();
        reportedScopeRows.forEach(row => {
            if (row.type === 'category') names.add(row.name);
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [reportedScopeRows]);

    const getCategoryAndSubcategory = useCallback((row: FlattenedItem): { categoryName: string; subcategoryName?: string } => {
        let categoryName = 'Uncategorized';
        let subcategoryName: string | undefined;
        for (const parentId of row.parentIds) {
            const parent = reportedScopeById.get(parentId);
            if (!parent) continue;
            if (parent.type === 'category' && categoryName === 'Uncategorized') categoryName = parent.name;
            if (parent.type === 'subcategory' && !subcategoryName) subcategoryName = parent.name;
        }
        return { categoryName, subcategoryName };
    }, [reportedScopeById]);

    const reportedEntries = useMemo(() => {
        return reportedScopeRows
            .filter(row => (row.type === 'group' || row.type === 'item') && (isReportedReadOnly || !hiddenRowIds.has(row.id)))
            .filter(row => normalizeItemPriority(row.priority) === 'Reported')
            .map(row => {
                const { categoryName, subcategoryName } = getCategoryAndSubcategory(row);
                return {
                    row,
                    categoryName,
                    subcategoryName,
                    images: normalizeItemImages(row),
                };
            });
    }, [reportedScopeRows, hiddenRowIds, isReportedReadOnly, getCategoryAndSubcategory]);

    const reportedReviewCards = useMemo<ReportedReviewCard[]>(() => {
        const cards: ReportedReviewCard[] = reportedEntries.map(entry => {
            const phaseLabels = normalizePhaseIds(entry.row.phaseIds).map(phaseId => phaseLabelById.get(phaseId) || 'Unknown');
            return {
                row: entry.row,
                categoryName: entry.categoryName,
                subcategoryName: entry.subcategoryName,
                phaseSummary: phaseLabels.length > 0 ? phaseLabels.join(', ') : 'No week',
                images: entry.images,
            };
        });
        cards.sort((a, b) => {
            const byCategory = a.categoryName.localeCompare(b.categoryName);
            if (byCategory !== 0) return byCategory;
            return a.row.name.localeCompare(b.row.name);
        });
        return cards;
    }, [reportedEntries, phaseLabelById]);

    const reportedItemsCount = reportedEntries.length;
    const reportedWithImageCount = useMemo(
        () => reportedEntries.reduce((count, entry) => count + (entry.images.length > 0 ? 1 : 0), 0),
        [reportedEntries]
    );
    const reportedWithoutImageEntries = useMemo(() => reportedEntries.filter(entry => entry.images.length === 0), [reportedEntries]);
    const reportedWithoutImageCount = reportedWithoutImageEntries.length;

    const reportedCategories = useMemo<ReportedCategoryStat[]>(() => {
        const counts = new Map<string, ReportedCategoryStat>();
        reportedCategoryNamesInScope.forEach(name => {
            counts.set(name, { name, reportedCount: 0, withImageCount: 0, withoutImageCount: 0 });
        });

        reportedEntries.forEach(entry => {
            const existing = counts.get(entry.categoryName) || {
                name: entry.categoryName,
                reportedCount: 0,
                withImageCount: 0,
                withoutImageCount: 0,
            };
            existing.reportedCount += 1;
            if (entry.images.length > 0) existing.withImageCount += 1;
            else existing.withoutImageCount += 1;
            counts.set(entry.categoryName, existing);
        });

        return Array.from(counts.values())
            .sort((a, b) => b.withImageCount - a.withImageCount || b.reportedCount - a.reportedCount || a.name.localeCompare(b.name));
    }, [reportedCategoryNamesInScope, reportedEntries]);

    const [reportedCategoryFilter, setReportedCategoryFilter] = useState<string>('__ALL__');

    useEffect(() => {
        if (reportedCategoryFilter === '__ALL__') return;
        const exists = reportedCategories.some(category => category.name === reportedCategoryFilter);
        if (!exists) setReportedCategoryFilter('__ALL__');
    }, [reportedCategories, reportedCategoryFilter]);

    useEffect(() => {
        if (!reportedMode || !isReportedReadOnly) return;
        setReportedCategoryFilter('__ALL__');
    }, [reportedMode, isReportedReadOnly]);

    const selectedReportedCategory = reportedCategoryFilter === '__ALL__' ? null : reportedCategoryFilter;
    const selectedReportedCategoryStat = useMemo(
        () => reportedCategories.find(category => category.name === selectedReportedCategory) || null,
        [reportedCategories, selectedReportedCategory]
    );

    const visibleReportedCards = useMemo(() => {
        if (reportedCategoryFilter === '__ALL__') return reportedReviewCards;
        return reportedReviewCards.filter(card => card.categoryName === reportedCategoryFilter);
    }, [reportedCategoryFilter, reportedReviewCards]);

    const visibleReportedWithoutImageEntries = useMemo(() => {
        if (reportedCategoryFilter === '__ALL__') return reportedWithoutImageEntries;
        return reportedWithoutImageEntries.filter(entry => entry.categoryName === reportedCategoryFilter);
    }, [reportedCategoryFilter, reportedWithoutImageEntries]);

    const visibleReportedItemsCount = selectedReportedCategoryStat?.reportedCount ?? reportedItemsCount;
    const visibleReportedWithImageCount = visibleReportedCards.length - visibleReportedWithoutImageEntries.length;
    const visibleReportedWithoutImageCount = selectedReportedCategoryStat?.withoutImageCount ?? reportedWithoutImageCount;

    const reportedMainState = useMemo(() => resolveReportedImageReviewMainState({
        isCategorySelected: !!selectedReportedCategory,
        visibleReportedItemCount: visibleReportedItemsCount,
        visibleReportedImageCount: visibleReportedWithImageCount,
        totalReportedItemCount: reportedItemsCount,
    }), [
        selectedReportedCategory,
        visibleReportedItemsCount,
        visibleReportedWithImageCount,
        reportedItemsCount,
    ]);

    const reportedImageErrorCount = useMemo(() => visibleReportedCards.reduce((count, card) => {
        const preview = card.images[0];
        if (!preview) return count;
        const key = `${card.row.id}::${preview.id}`;
        return reportedImageErrorKeys[key] ? count + 1 : count;
    }, 0), [reportedImageErrorKeys, visibleReportedCards]);

    const activeNoteItem = useMemo(() => {
        if (!activeNotePreview) return null;
        return findNodeById(viewData.items, activeNotePreview.id);
    }, [activeNotePreview, viewData.items]);
    const activeNotePermission = useMemo(
        () => activeNoteItem ? getRowPermission(activeNoteItem.id) : null,
        [activeNoteItem, getRowPermission]
    );
    const activeNoteText = activeNoteItem?.quickNote?.trim() || '';
    const activeNoteOriginal = activeNoteItem?.quickNote || '';
    const activeImagePreviewItem = useMemo(() => {
        if (!activeImagePreviewId) return null;
        return findNodeById(viewData.items, activeImagePreviewId);
    }, [activeImagePreviewId, viewData.items]);
    const activeImagePreviewPermission = useMemo(
        () => activeImagePreviewItem ? getRowPermission(activeImagePreviewItem.id) : null,
        [activeImagePreviewItem, getRowPermission]
    );
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
    const activeImagePreviewPhaseIds = useMemo(() => normalizePhaseIds(activeImagePreviewItem?.phaseIds), [activeImagePreviewItem]);
    const activeImagePreviewPhaseLabels = useMemo(
        () => activeImagePreviewPhaseIds.map(phaseId => phaseLabelById.get(phaseId) || 'Unknown'),
        [activeImagePreviewPhaseIds, phaseLabelById]
    );
    const activeImagePreviewPhaseIdSet = useMemo(() => new Set(activeImagePreviewPhaseIds), [activeImagePreviewPhaseIds]);
    const isActiveImageStatusInlineEditable = !!activeImagePreviewItem
        && !!activeImagePreviewPermission?.canEditStatus
        && activeImagePreviewItem.type !== 'category'
        && activeImagePreviewItem.type !== 'subcategory'
        && (activeImagePreviewItem.statusMode !== 'auto' || !isAdminLevel(currentUser));
    const canEditActiveImagePhase = !!activeImagePreviewItem && canEditStructure && phaseOptions.length > 0;
    const canEditActiveImageNote = !!activeImagePreviewPermission?.canEditNotes;
    const activeImagePreviewStatus = activeImagePreviewItem?.status || 'Not Started';
    const isQuickNoteDirty = !!activeNoteItem && quickNoteDraft !== activeNoteOriginal;

    useEffect(() => {
        setActiveViewerImageHasError(false);
    }, [activeImagePreviewId, normalizedActiveImagePreviewIndex, activeImagePreviewImage?.url]);

    useEffect(() => {
        if (!reportedMode) setReportedImageErrorKeys({});
    }, [reportedMode]);

    useEffect(() => {
        setImagePreviewNoteDraft(activeImagePreviewItem?.quickNote?.trim() || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeImagePreviewItem?.id]);

    const closeImagePreview = useCallback(() => {
        setActiveImagePreviewId(null);
        setActiveImagePreviewIndex(0);
        setOpenStatusId(null);
        setOpenPhaseId(null);
        setViewerInlineSaveFeedback(null);
    }, []);

    const resetQuickNoteState = useCallback(() => {
        setActiveNotePreview(null);
        setIsQuickNoteEditing(false);
        setQuickNoteDraft('');
        setQuickNoteSaving(false);
    }, []);

    const closeQuickNotePreview = useCallback(async (skipDirtyCheck = false): Promise<boolean> => {
        if (!activeNotePreview) return true;
        if (!skipDirtyCheck && !!activeNotePermission?.canEditNotes && isQuickNoteEditing && isQuickNoteDirty) {
            const confirmClose = await showConfirm('Quick note đang có thay đổi chưa lưu. Đóng mà không lưu?');
            if (!confirmClose) return false;
        }
        resetQuickNoteState();
        return true;
    }, [activeNotePermission, activeNotePreview, isQuickNoteDirty, isQuickNoteEditing, resetQuickNoteState, showConfirm]);

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
            closeImagePreview();
            return;
        }
        if (activeImagePreviewIndex >= activeImagePreviewImages.length) {
            setActiveImagePreviewIndex(0);
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeImagePreview();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = previousOverflow;
        };
    }, [activeImagePreviewId, activeImagePreviewItem, activeImagePreviewImages.length, activeImagePreviewIndex, activeImagePreviewUrl, closeImagePreview]);

    useEffect(() => {
        if (!viewerInlineSaveFeedback || viewerInlineSaveFeedback.state !== 'saving') return;
        if (isSaving) return;
        if (saveTick <= viewerInlineSaveFeedback.startedAtSaveTick) return;

        if (saveState === 'success') {
            setViewerInlineSaveFeedback({
                state: 'success',
                message: 'Đã lưu thay đổi.',
                startedAtSaveTick: saveTick,
            });
            return;
        }

        if (saveState === 'error') {
            setViewerInlineSaveFeedback({
                state: 'error',
                message: 'Lưu thất bại. Vui lòng thử lại.',
                startedAtSaveTick: saveTick,
            });
        }
    }, [isSaving, saveState, saveTick, viewerInlineSaveFeedback]);

    useEffect(() => {
        if (!viewerInlineSaveFeedback || viewerInlineSaveFeedback.state === 'saving') return;
        const timeout = window.setTimeout(() => {
            setViewerInlineSaveFeedback(null);
        }, viewerInlineSaveFeedback.state === 'success' ? 1500 : 2600);
        return () => window.clearTimeout(timeout);
    }, [viewerInlineSaveFeedback]);

    useEffect(() => {
        if (editingItem) return;
        if (!resumeViewerAfterEdit) return;

        const source = findNodeById(data.items, resumeViewerAfterEdit.itemId);
        if (!source) {
            setResumeViewerAfterEdit(null);
            return;
        }

        const images = normalizeItemImages(source);
        if (images.length === 0) {
            setResumeViewerAfterEdit(null);
            return;
        }

        const safeIndex = Math.max(0, Math.min(resumeViewerAfterEdit.imageIndex, images.length - 1));
        setActiveImagePreviewId(source.id);
        setActiveImagePreviewIndex(safeIndex);
        setResumeViewerAfterEdit(null);
    }, [editingItem, resumeViewerAfterEdit, data.items]);

    useEffect(() => {
        if (!openWorkTypeId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-worktype-dropdown="true"]')) return;
            if (target.closest('[data-worktype-trigger="true"]')) return;
            setOpenWorkTypeId(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenWorkTypeId(null);
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [openWorkTypeId]);

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
        if (!openVersionId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-version-dropdown="true"]')) return;
            if (target.closest('[data-version-trigger="true"]')) return;
            setOpenVersionId(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenVersionId(null);
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [openVersionId]);

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

    useEffect(() => {
        if (!openStatusId) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-status-dropdown="true"]')) return;
            if (target.closest('[data-status-trigger="true"]')) return;
            setOpenStatusId(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenStatusId(null);
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [openStatusId]);

    useEffect(() => {
        if (!editingExtraCell) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-extra-dropdown="true"]')) return;
            if (target.closest('[data-extra-input="true"]')) return;
            setEditingExtraCell(null);
            setExtraCellAnchorRect(null);
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setEditingExtraCell(null); setExtraCellAnchorRect(null); }
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [editingExtraCell]);

    useEffect(() => {
        if (!dateMiniPopup) return;
        const handleViewportChange = () => setDateMiniPopup(null);
        window.addEventListener('resize', handleViewportChange);
        return () => {
            window.removeEventListener('resize', handleViewportChange);
        };
    }, [dateMiniPopup]);

    useEffect(() => {
        if (!dateMiniPopup) return;
        if (!currentUser || !findNodeById(data.items, dateMiniPopup.itemId)) {
            setDateMiniPopup(null);
        }
    }, [currentUser, data.items, dateMiniPopup]);

    // Tự động căn chỉnh độ rộng cột FEATURES theo nội dung hiển thị (có giới hạn min max)
    useEffect(() => {
        if (nameWMode !== 'auto') return;
        let maxW = 160; // Chiều rộng tối thiểu
        for (const row of flattened) {
            let displayDepth = row.depth;
            if (row.type === 'item') displayDepth = row.depth + 1;
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
    const timelineLeftOffset = timelineOnly ? timelineTaskW : 0;
    const timelineCanvasWidth = timelineLeftOffset + timelineUnits.length * timelineUnitWidth;

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
        if (!canEditStructure) return;
        onDataChange({ ...data, items: updateNodeById(data.items, updated.id, touchItemTimestamp(updated)) }, true);
        if (updated.children && updated.children.length > 0) {
            setExpandedIds(prev => new Set([...prev, updated.id]));
        }
    };
    const handleDelete = async (id: string) => {
        if (!canEditStructure) return;
        if (!(await showConfirm('Bạn có chắc muốn xoá mục này và toàn bộ nội dung con của nó không?'))) return;
        onDataChange({ ...data, items: deleteNodeById(data.items, id) }, true);
    };
    const handleAddChild = (parentId: string, newItem: RoadmapItem) => {
        if (!canEditStructure) return;
        if (parentId === '__ROOT__') { onRootAdd(newItem); return; }
        const newItems = addChildToNode(data.items, parentId, newItem);

        const nextExp = new Set([...expandedIds, parentId]);
        if (newItem.children && newItem.children.length > 0) {
            nextExp.add(newItem.id);
        }

        setExpandedIds(nextExp);
        onDataChange({ ...data, items: newItems }, true);
    };

    const isValidSameLayerDrop = useCallback((sourceId: string, targetId: string): boolean => {
        if (sourceId === targetId) return false;
        const source = flattened.find(item => item.id === sourceId);
        const target = flattened.find(item => item.id === targetId);
        if (!source || !target) return false;
        if (source.type === 'team' || target.type === 'team') return false;
        if (source.type !== target.type) return false;
        const sourceParent = source.parentIds[source.parentIds.length - 1] || null;
        const targetParent = target.parentIds[target.parentIds.length - 1] || null;
        return sourceParent === targetParent;
    }, [flattened]);

    const isValidParentDrop = useCallback((sourceId: string, targetId: string): boolean => {
        if (sourceId === targetId) return false;
        const source = flattened.find(item => item.id === sourceId);
        const target = flattened.find(item => item.id === targetId);
        if (!source || !target) return false;
        if (source.type === 'team' || target.type === 'team') return false;
        if (target.parentIds.includes(sourceId)) return false;

        return (
            (source.type === 'subcategory' && target.type === 'category')
            || (source.type === 'group' && target.type === 'subcategory')
            || (source.type === 'item' && target.type === 'group')
        );
    }, [flattened]);

    const getDropMode = useCallback((sourceId: string, targetId: string): 'reorder' | 'parent' | null => {
        if (isValidSameLayerDrop(sourceId, targetId)) return 'reorder';
        if (isValidParentDrop(sourceId, targetId)) return 'parent';
        return null;
    }, [isValidParentDrop, isValidSameLayerDrop]);

    // ── Drag & Drop Handlers ──
    const handleDragStart = (e: React.DragEvent, id: string) => {
        if (!canEditStructure) return;
        setDraggedId(id);
        setDragOverId(null);
        setDragOverMode(null);
        e.dataTransfer.effectAllowed = 'move';
        // Setting transparent image helps styling custom drag ghost if needed
    };
    const handleDragOver = (e: React.DragEvent, id: string) => {
        if (!canEditStructure) return;
        e.preventDefault(); // enable drop
        const mode = draggedId ? getDropMode(draggedId, id) : null;
        if (mode) {
            e.dataTransfer.dropEffect = 'move';
            setDragOverId(id);
            setDragOverMode(mode);
        } else {
            e.dataTransfer.dropEffect = 'none';
            setDragOverId(null);
            setDragOverMode(null);
        }
    };
    const handleDragLeave = () => {
        setDragOverId(null);
        setDragOverMode(null);
    };
    const handleDrop = (e: React.DragEvent, targetId: string) => {
        if (!canEditStructure) return;
        e.preventDefault();
        const mode = draggedId ? getDropMode(draggedId, targetId) : null;
        if (draggedId && mode) {
            if (mode === 'reorder') {
                const reorderedItems = reorderItems(data.items, draggedId, targetId);
                if (reorderedItems !== data.items) {
                    const movedItem = findNodeById(reorderedItems, draggedId);
                    const newItems = movedItem
                        ? updateNodeById(reorderedItems, draggedId, touchItemTimestamp(movedItem))
                        : reorderedItems;
                    onDataChange({ ...data, items: newItems }, true);
                }
            } else if (mode === 'parent') {
                const movedItems = moveNodeToParent(data.items, draggedId, targetId);
                if (movedItems !== data.items) {
                    const movedItem = findNodeById(movedItems, draggedId);
                    const newItems = movedItem
                        ? updateNodeById(movedItems, draggedId, touchItemTimestamp(movedItem))
                        : movedItems;
                    setExpandedIds(prev => new Set([...prev, targetId]));
                    onDataChange({ ...data, items: newItems }, true);
                }
            }
        }
        setDraggedId(null);
        setDragOverId(null);
        setDragOverMode(null);
    };
    const handleDragEnd = () => {
        setDraggedId(null);
        setDragOverId(null);
        setDragOverMode(null);
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
        const rowPermission = getRowPermission(row.id);

        setActiveNotePreview({ id: row.id, top, left });
        setQuickNoteDraft(note);
        setIsQuickNoteEditing(rowPermission.canEditNotes && note.trim().length === 0);
        setQuickNoteSaving(false);
    };

    const openImagePreview = async (event: React.MouseEvent, row: FlattenedItem) => {
        event.stopPropagation();
        const rowImages = normalizeItemImages(row);
        if (rowImages.length === 0) {
            if (!canEditStructure) return;
            if (activeNotePreview) {
                const closed = await closeQuickNotePreview();
                if (!closed) return;
            }
            setOpenStatusId(null);
            setOpenPhaseId(null);
            openEditor(row.id);
            return;
        }

        if (activeImagePreviewId === row.id) {
            closeImagePreview();
            return;
        }

        if (activeNotePreview) {
            const closed = await closeQuickNotePreview();
            if (!closed) return;
        }

        setOpenStatusId(null);
        setOpenPhaseId(null);
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
        if (!canEditStructure) return;
        const node = findNodeById(data.items, id);
        if (node) setEditingItem(node);
    };

    const openFullEditorFromQuickNote = async () => {
        if (!canEditStructure || !activeNoteItem) return;
        if (isQuickNoteEditing && isQuickNoteDirty) {
            const confirmDiscard = await showConfirm('Quick note đang có thay đổi chưa lưu. Mở Edit mà không lưu?');
            if (!confirmDiscard) return;
        }
        const id = activeNoteItem.id;
        resetQuickNoteState();
        openEditor(id);
    };

    const toggleQuickNoteEditMode = async () => {
        if (!activeNoteItem || !activeNotePermission?.canEditNotes) return;
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

    const updateFromSource = (
        id: string,
        mapper: (source: RoadmapItem) => RoadmapItem,
        shouldSave = false
    ) => {
        if (!canEditStructure) return;
        const source = findNodeById(data.items, id);
        if (!source) return;
        onDataChange({ ...data, items: updateNodeById(data.items, id, touchItemTimestamp(mapper(source))) }, shouldSave);
    };

    const applyEditableFieldChanges = useCallback((
        id: string,
        changes: ManagerFieldChange[],
        mapper: (source: RoadmapItem) => RoadmapItem
    ) => {
        const source = findNodeById(data.items, id);
        if (!source) return;

        const nextItem = touchItemTimestamp(mapper(source));
        const nextData = { ...data, items: updateNodeById(data.items, id, nextItem) };

        if (canEditStructure) {
            onDataChange(nextData, true);
            return;
        }

        onManagerFieldChanges(changes, nextData);
    }, [canEditStructure, data, onDataChange, onManagerFieldChanges]);

    const handleQuickNoteSave = async () => {
        if (!activeNoteItem || !activeNotePermission?.canEditNotes || quickNoteSaving || !isQuickNoteDirty) return;
        setQuickNoteSaving(true);
        try {
            const normalizedNote = quickNoteDraft.trim();
            applyEditableFieldChanges(
                activeNoteItem.id,
                [{ itemId: activeNoteItem.id, field: 'quickNote', value: normalizedNote || null }],
                source => {
                    const next = { ...source };
                    if (normalizedNote.length > 0) next.quickNote = normalizedNote;
                    else delete next.quickNote;
                    return next;
                }
            );
            setQuickNoteDraft(normalizedNote);
            setIsQuickNoteEditing(false);
        } finally {
            setQuickNoteSaving(false);
        }
    };

    const handleImagePreviewNoteSave = () => {
        if (!activeImagePreviewItem || !canEditActiveImageNote) return;
        const trimmed = imagePreviewNoteDraft.trim();
        const current = (activeImagePreviewItem.quickNote || '').trim();
        if (trimmed === current) return;
        updateActivePreviewItemWithSaveFeedback(
            source => {
                const next = { ...source };
                if (trimmed.length > 0) next.quickNote = trimmed;
                else delete next.quickNote;
                return next;
            },
            [{ itemId: activeImagePreviewItem.id, field: 'quickNote', value: trimmed || null }]
        );
    };

    const isDateInlineEditable = useCallback((row: FlattenedItem): boolean => {
        if (!getRowPermission(row.id).canEditDates) return false;
        // Admin-level: keep original logic (block auto-calculated parents)
        if (isAdminLevel(currentUser)) {
            const hasNonTeamChildren = !!(row.children && row.children.some(child => child.type !== 'team'));
            const isManualMode = row.statusMode === 'manual';
            return !hasNonTeamChildren || isManualMode;
        }
        // Manager: can edit dates on any non-category item (permission already blocks category)
        return true;
    }, [currentUser, getRowPermission]);

    const openDateMiniPopup = useCallback((
        event: React.MouseEvent<HTMLDivElement>,
        row: FlattenedItem,
        field: 'startDate' | 'endDate'
    ) => {
        if (!isDateInlineEditable(row)) return;
        event.stopPropagation();
        if (dateMiniPopup?.itemId === row.id && dateMiniPopup.field === field) {
            setDateMiniPopup(null);
            return;
        }
        setOpenWorkTypeId(null);
        setOpenPriorityId(null);
        setOpenStatusId(null);
        setOpenPhaseId(null);
        setDateMiniPopup({
            itemId: row.id,
            field,
            value: field === 'startDate' ? row.startDate : row.endDate,
            siblingValue: field === 'startDate' ? row.endDate : row.startDate,
            anchorRect: event.currentTarget.getBoundingClientRect(),
        });
    }, [dateMiniPopup, isDateInlineEditable]);

    const updateActivePreviewItemWithSaveFeedback = (
        mapper: (source: RoadmapItem) => RoadmapItem,
        changes?: ManagerFieldChange[]
    ) => {
        if (!activeImagePreviewItem) return;
        setViewerInlineSaveFeedback({
            state: 'saving',
            message: 'Đang lưu thay đổi...',
            startedAtSaveTick: saveTick,
        });
        if (changes && changes.length > 0) {
            applyEditableFieldChanges(activeImagePreviewItem.id, changes, mapper);
            return;
        }
        updateFromSource(activeImagePreviewItem.id, mapper, true);
    };

    const toggleReviewedGroup = (groupId: string) => {
        setReviewedGroupNumberById(prev => {
            const existing = prev[groupId];
            if (typeof existing === 'number') {
                const next = { ...prev };
                delete next[groupId];
                return next;
            }
            const nextNumber = Object.values(prev).reduce((max, value) => Math.max(max, value), 0) + 1;
            return {
                ...prev,
                [groupId]: nextNumber,
            };
        });
    };

    // ── Column resize via mouse drag ──
    const startResize = useCallback((
        e: React.MouseEvent,
        setter: React.Dispatch<React.SetStateAction<number>>,
        minW: number,
        maxW?: number
    ) => {
        e.preventDefault();
        const startX = e.clientX;
        let startW = 0;
        setter(w => { startW = w; return w; }); // capture current

        const onMove = (ev: MouseEvent) => {
            const next = Math.max(minW, Math.min(maxW ?? Number.POSITIVE_INFINITY, startW + (ev.clientX - startX)));
            setter(next);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    // ── Custom columns from config ──
    const customColumns = roadmapConfig.columns ?? [];
    const DEFAULT_CUSTOM_COL_W = 100;

    // ── Computed total left pane width ──
    const customColTotalW = customColumns.reduce((sum, col) => sum + (col.width ?? DEFAULT_CUSTOM_COL_W), 0);
    const totalLeftW = nameW
        + (showWorkType ? COL_WORK_TYPE_W : 0)
        + (showPriority ? COL_PRIORITY_W : 0)
        + statusW
        + customColTotalW
        + (showPhase ? phaseW : 0)
        + (showStartDate ? startDateW : 0)
        + (showEndDate ? endDateW : 0)
        + (showVersion ? COL_VERSION_W : 0)
        + COL_ACTIONS_W;
    const TOTAL_HEADER_H = MILESTONE_HEADER_H + ROW_HEIGHT + ROW_HEIGHT;

    // Grid template for left pane rows/header
    const customColTemplate = customColumns.map(col => ` ${col.width ?? DEFAULT_CUSTOM_COL_W}px`).join('');
    const gridTemplate = `${nameW}px`
        + (showWorkType ? ` ${COL_WORK_TYPE_W}px` : '')
        + (showPriority ? ` ${COL_PRIORITY_W}px` : '')
        + ` ${statusW}px`
        + customColTemplate
        + (showPhase ? ` ${phaseW}px` : '')
        + (showStartDate ? ` ${startDateW}px` : '')
        + (showEndDate ? ` ${endDateW}px` : '')
        + (showVersion ? ` ${COL_VERSION_W}px` : '')
        + ` ${COL_ACTIONS_W}px`;

    return (
        <div className="flex h-full w-full bg-white overflow-hidden text-[12px] text-gray-900 font-sans">
            {canEditStructure && editingItem && (
                <EditPopup
                    item={editingItem}
                    phases={phaseOptions}
                    allVersions={allVersions}
                    onSave={handleEditSave}
                    onClose={() => setEditingItem(null)}
                    roadmapConfig={roadmapConfig}
                />
            )}
            {canEditStructure && addingToParent && (
                <AddNodePopup parentId={addingToParent.id} parentName={addingToParent.name} childType={addingToParent.childType}
                    onAdd={handleAddChild} onClose={() => setAddingToParent(null)} roadmapConfig={roadmapConfig} />
            )}

            {reportedMode ? (
                <div className="flex h-full w-full flex-col overflow-hidden bg-[#F7F8FA]">
                    {/* ── Header bar ── */}
                    <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
                        <div className="min-w-0 flex-1">
                            <h1 className="text-sm font-bold text-slate-900">Reported Image Review</h1>
                            <p className="text-[11px] text-slate-500">
                                {reportedItemsCount} reported · {reportedWithImageCount} có ảnh · {reportedWithoutImageCount} thiếu ảnh
                            </p>
                            {reportedBridgeLabel && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                        {reportedBridgeLabel}
                                    </span>
                                    {isReportedReadOnly && (
                                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                            Source: main
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Quick stats badges */}
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                                {reportedItemsCount} reported
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                {reportedWithImageCount} có ảnh
                            </span>
                            {reportedWithoutImageCount > 0 && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                                    {reportedWithoutImageCount} thiếu ảnh
                                </span>
                            )}
                        </div>
                        <div className="shrink-0 rounded bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            {visibleReportedCards.length}/{visibleReportedItemsCount} trong view
                        </div>
                    </div>

                    {/* ── Body: sidebar + content ── */}
                    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
                        {/* Sidebar */}
                        <aside className="flex flex-col overflow-hidden border-r border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2.5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category</p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                                <button
                                    type="button"
                                    className={`mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[12px] font-semibold transition-colors ${reportedCategoryFilter === '__ALL__'
                                        ? 'bg-amber-500 text-white'
                                        : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                    onClick={() => setReportedCategoryFilter('__ALL__')}
                                >
                                    <span>All Categories</span>
                                    <span className={`text-[11px] ${reportedCategoryFilter === '__ALL__' ? 'text-white/80' : 'text-slate-400'}`}>
                                        {reportedWithImageCount}/{reportedItemsCount}
                                    </span>
                                </button>
                                {reportedCategories.map(category => (
                                    <button
                                        key={category.name}
                                        type="button"
                                        className={`mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[12px] font-semibold transition-colors ${reportedCategoryFilter === category.name
                                            ? 'bg-amber-500 text-white'
                                            : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                        onClick={() => setReportedCategoryFilter(category.name)}
                                    >
                                        <span className="min-w-0 truncate">{category.name}</span>
                                        <span className={`ml-1 shrink-0 text-[11px] ${reportedCategoryFilter === category.name ? 'text-white/80' : 'text-slate-400'}`}>
                                            {category.withImageCount}/{category.reportedCount}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </aside>

                        {/* Content area */}
                        <div className="flex min-h-0 flex-col overflow-hidden">
                            {/* Inline alerts */}
                            {(!effectiveDocumentPermission.canEditStatus || isSaving || (!isSaving && saveState === 'error') || reportedImageErrorCount > 0 || (reportedMainState === 'ready' && visibleReportedWithoutImageCount > 0) || reportedBridgeLoading || !!reportedBridgeError || isReportedReadOnly) && (
                                <div className="flex shrink-0 flex-col gap-1.5 border-b border-slate-200 bg-white px-4 py-2">
                                    {isReportedReadOnly && (
                                        <div className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700">
                                            Đang xem dữ liệu Reported từ roadmap main ở chế độ read-only.
                                        </div>
                                    )}
                                    {reportedBridgeLoading && (
                                        <div className="animate-pulse rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700">
                                            Đang tải dữ liệu reported...
                                        </div>
                                    )}
                                    {reportedBridgeError && (
                                        <div className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
                                            {reportedBridgeError}
                                        </div>
                                    )}
                                    {!isReportedReadOnly && !effectiveDocumentPermission.canEditStatus && (
                                        <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">
                                            Viewer mode - Dang nhap dung team de chinh status va note.
                                        </div>
                                    )}
                                    {isSaving && (
                                        <div className="animate-pulse rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700">
                                            Đang lưu thay đổi mới nhất...
                                        </div>
                                    )}
                                    {!isSaving && saveState === 'error' && (
                                        <div className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
                                            Lưu dữ liệu thất bại. Vui lòng thử lại.
                                        </div>
                                    )}
                                    {reportedImageErrorCount > 0 && (
                                        <div className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] font-semibold text-orange-700">
                                            {reportedImageErrorCount} ảnh lỗi tải. Bạn vẫn có thể bấm card để mở viewer.
                                        </div>
                                    )}
                                    {reportedMainState === 'ready' && visibleReportedWithoutImageCount > 0 && (
                                        <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                                            {visibleReportedWithoutImageCount} item reported chưa có ảnh trong scope hiện tại.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Scrollable card grid */}
                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                {reportedBridgeLoading && (
                                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 text-center">
                                        <p className="text-sm font-semibold text-slate-700">Đang tải Reported Data</p>
                                        <p className="mt-1 text-xs text-slate-500">Đang lấy dữ liệu reported từ roadmap main.</p>
                                    </div>
                                )}

                                {!reportedBridgeLoading && reportedBridgeError && (
                                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-rose-300 px-4 text-center">
                                        <p className="text-sm font-semibold text-rose-700">Không tải được Reported Data</p>
                                        <p className="mt-1 text-xs text-rose-500">{reportedBridgeError}</p>
                                    </div>
                                )}

                                {!reportedBridgeLoading && !reportedBridgeError && reportedMainState === 'no-reported-data' && (
                                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 text-center">
                                        <p className="text-sm font-semibold text-slate-700">No Reported Data</p>
                                        <p className="mt-1 text-xs text-slate-500">Không có item <code>Priority = Reported</code> theo bộ lọc hiện tại.</p>
                                    </div>
                                )}

                                {!reportedBridgeLoading && !reportedBridgeError && reportedMainState === 'empty-category' && (
                                    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 text-center">
                                        <p className="text-sm font-semibold text-slate-700">Empty Category</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Category <strong>{selectedReportedCategory}</strong> chưa có item reported trong scope hiện tại.
                                        </p>
                                    </div>
                                )}

                                {!reportedBridgeLoading && !reportedBridgeError && reportedMainState === 'ready' && (
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                                        {visibleReportedCards.map(card => {
                                            const preview = card.images[0] || null;
                                            const previewKey = preview ? `${card.row.id}::${preview.id}` : `${card.row.id}::no-image`;
                                            const hasPreviewError = preview ? !!reportedImageErrorKeys[previewKey] : false;
                                            const hasImage = !!preview;
                                            const hasNote = !!card.row.quickNote?.trim();
                                            const metaLine = card.subcategoryName
                                                ? `${card.categoryName} • ${card.subcategoryName}`
                                                : card.categoryName;
                                            const cardStatus = card.row.status || 'Not Started';
                                            const statusBg = STATUS_TAG_BG[cardStatus] || '#f3f4f6';
                                            const statusText = STATUS_TAG_TEXT[cardStatus] || '#374151';
                                            return (
                                                <button
                                                    key={card.row.id}
                                                    type="button"
                                                    className="group rounded-xl border border-[#E6EBF2] bg-white text-left shadow-sm transition-all hover:border-amber-400 hover:shadow-md"
                                                    onClick={(event) => { void openImagePreview(event, card.row); }}
                                                >
                                                    {/* Image area */}
                                                    <div className="relative overflow-hidden rounded-t-xl bg-slate-100">
                                                        {!hasImage ? (
                                                            <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 bg-slate-100 text-center">
                                                                <ImageIcon size={16} className="text-slate-400" />
                                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                                    No image
                                                                </span>
                                                            </div>
                                                        ) : hasPreviewError ? (
                                                            <div className="flex aspect-[3/4] w-full items-center justify-center bg-slate-200 text-center text-[10px] font-semibold text-slate-400">
                                                                Lỗi tải ảnh
                                                            </div>
                                                        ) : (
                                                            <img
                                                                src={preview.url}
                                                                alt={preview.name || card.row.name}
                                                                className="aspect-[3/4] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                                                loading="lazy"
                                                                onLoad={() => {
                                                                    setReportedImageErrorKeys(prev => {
                                                                        if (!prev[previewKey]) return prev;
                                                                        const next = { ...prev };
                                                                        delete next[previewKey];
                                                                        return next;
                                                                    });
                                                                }}
                                                                onError={() => {
                                                                    setReportedImageErrorKeys(prev => {
                                                                        if (prev[previewKey]) return prev;
                                                                        return { ...prev, [previewKey]: true };
                                                                    });
                                                                }}
                                                            />
                                                        )}
                                                        {hasNote && (
                                                            <span
                                                                className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5"
                                                                title="Có ghi chú"
                                                            >
                                                                <MessageSquare size={9} className="text-white" />
                                                            </span>
                                                        )}
                                                        {hasImage && card.images.length > 1 && (
                                                            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                                                                +{card.images.length - 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Card metadata */}
                                                    <div className="p-2">
                                                        <p className="truncate text-[12px] font-semibold leading-snug text-[#0B132B]">{card.row.name}</p>
                                                        <p className="mt-0.5 truncate text-[10px] text-[#64748B]">{metaLine}</p>
                                                        <div className="mt-1.5 flex items-center justify-between gap-1">
                                                            {cardStatus !== 'None' && (
                                                                <span
                                                                    className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                                                    style={{ backgroundColor: statusBg, color: statusText }}
                                                                >
                                                                    {cardStatus}
                                                                </span>
                                                            )}
                                                            {card.phaseSummary !== 'No week' && (
                                                                <span className="shrink-0 truncate text-[10px] text-[#64748B]">{card.phaseSummary}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
            <>
            {/* ── LEFT PANE ── */}
            {!timelineOnly && (
            <div className="shrink-0 border-r-2 border-gray-500 flex flex-col overflow-hidden" style={{ width: totalLeftW }}>

                {/* Left header */}
                <div
                    className="shrink-0 border-b-2 border-gray-500 bg-gray-300 grid text-[11px] font-bold text-gray-700 select-none relative"
                    style={{ gridTemplateColumns: gridTemplate, height: TOTAL_HEADER_H }}
                >
                    {/* FEATURES – resize handle on right */}
                    <div className="flex items-center px-2 border-r border-gray-400 relative group/col">
                        FEATURES
                        {canEditStructure && (
                            <button
                                className="ml-1.5 text-green-600 hover:text-green-800 transition-colors"
                                title="Thêm Category"
                                onClick={() => setAddingToParent({ id: '__ROOT__', name: 'Roadmap', childType: 'category' })}
                            >
                                <PlusCircle size={13} />
                            </button>
                        )}
                        <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/40 z-10"
                            onMouseDown={e => { setNameWMode('manual'); startResize(e, setNameW, 120); }}
                            title="Kéo để thay đổi cột"
                        />
                    </div>

                    {/* WORKTYPE header – click to hide */}
                    {showWorkType && (
                        <div
                            className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột WorkType"
                            onClick={() => setShowWorkType(false)}
                            style={{ minWidth: COL_WORK_TYPE_W, width: COL_WORK_TYPE_W }}
                        >
                            <span className="text-indigo-700">WORKTYPE</span>
                        </div>
                    )}

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

                    {/* Custom columns headers */}
                    {customColumns.map(col => (
                        <div key={col.key}
                            className="flex items-center justify-center border-r border-gray-400 select-none"
                            style={{ minWidth: col.width ?? DEFAULT_CUSTOM_COL_W, width: col.width ?? DEFAULT_CUSTOM_COL_W }}
                        >
                            <span className="text-[10px] font-semibold text-gray-600 uppercase truncate px-1">{col.label}</span>
                        </div>
                    ))}

                    {/* WEEK header – click to hide */}
                    {showPhase && (
                        <div
                            className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột Week"
                            onClick={() => setShowPhase(false)}
                            style={{ minWidth: phaseW, width: phaseW }}
                        >
                            <span className="text-indigo-700">WEEK</span>
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

                    {/* VERSION header – click to hide */}
                    {showVersion && (
                        <div className="flex items-center justify-center border-r border-gray-400 cursor-pointer hover:bg-indigo-100 transition-colors select-none"
                            title="Click để ẩn cột Version"
                            onClick={() => setShowVersion(false)}
                            style={{ minWidth: COL_VERSION_W, width: COL_VERSION_W }}
                        >
                            <span className="text-indigo-700">VER</span>
                        </div>
                    )}

                    {/* Actions column header – shows restore buttons when hidden */}
                    <div className="flex items-center flex-wrap justify-center gap-0.5 px-0.5">
                        {!showWorkType && (
                            <button title="Hiện cột WorkType" onClick={() => setShowWorkType(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                W
                            </button>
                        )}
                        {!showPriority && (
                            <button title="Hiện cột Priority" onClick={() => setShowPriority(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                P
                            </button>
                        )}
                        {!showVersion && (
                            <button title="Hiện cột Version" onClick={() => setShowVersion(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                V
                            </button>
                        )}
                        {!showPhase && (
                            <button title="Hiện cột Week" onClick={() => setShowPhase(true)}
                                className="text-[8px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 hover:bg-indigo-200 rounded px-1 transition-colors">
                                W
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
                        const rowPhaseChips = rowPhaseIds.map((phaseId, chipIndex) => ({
                            id: phaseId,
                            label: phaseLabelById.get(phaseId) || 'Unknown',
                            color: phaseColorById.get(phaseId) || normalizeWeekColor('', chipIndex),
                        }));
                        const rowPermission = getRowPermission(row.id);
                        const isStatusInlineEditable = rowPermission.canEditStatus && (row.statusMode !== 'auto' || !isAdminLevel(currentUser));
                        const isDateCellEditable = isDateInlineEditable(row);
                        const groupInlinePhaseIds = row.type === 'group' ? (groupInlinePhaseIdsById.get(row.id) || []) : [];
                        const groupInlinePhaseTags = groupInlinePhaseIds.map((phaseId, tagIndex) => ({
                            id: phaseId,
                            short: phaseShortById.get(phaseId) || 'W?',
                            full: phaseLabelById.get(phaseId) || 'Unknown',
                            color: phaseColorById.get(phaseId) || normalizeWeekColor('', tagIndex),
                        }));
                        const groupInlinePhaseVisible = groupInlinePhaseTags.slice(0, 2);
                        const groupInlinePhaseMore = Math.max(0, groupInlinePhaseTags.length - groupInlinePhaseVisible.length);
                        const groupInlinePhaseMoreTitle = groupInlinePhaseTags
                            .slice(2)
                            .map(tag => `${tag.short}: ${tag.full}`)
                            .join(', ');
                        const shouldShowGroupInlinePhase = row.type === 'group' && groupInlinePhaseTags.length > 0;
                        const reviewedMarkerNumber = row.type === 'group' ? reviewedGroupNumberById[row.id] : undefined;
                        const isGroupReviewed = typeof reviewedMarkerNumber === 'number';

                        const canDragRow = canEditStructure && row.type !== 'team';
                        const isDragged = draggedId === row.id;
                        const isDragOverReorder = dragOverId === row.id && dragOverMode === 'reorder';
                        const isDragOverParent = dragOverId === row.id && dragOverMode === 'parent';

                        const isManagerNonAdmin = currentUser?.role === 'manager' && currentUser?.team && !isAdminLevel(currentUser);
                        const isOtherTeamRow = isManagerNonAdmin
                            && row.type === 'team'
                            && row.teamRole
                            && row.teamRole !== currentUser!.team;
                        const isNonEditableParentRow = isManagerNonAdmin
                            && (row.type === 'group' || row.type === 'subcategory' || row.type === 'category');

                        return (
                            <div key={row.id}
                                className={`grid border-b border-gray-300 group hover:brightness-95 ${isDragged ? 'opacity-30' : ''} ${isDragOverReorder ? 'border-t-4 border-t-blue-500' : ''} ${isDragOverParent ? 'ring-2 ring-inset ring-emerald-500' : ''}`}
                                style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT, backgroundColor: getRowBg(style.bg, rowPhaseIds, phaseColorById) }}
                                draggable={canDragRow}
                                onMouseEnter={() => setHoveredRowId(row.id)}
                                onMouseLeave={() => setHoveredRowId(prev => prev === row.id ? null : prev)}
                                onDragStart={canDragRow ? (e) => handleDragStart(e, row.id) : undefined}
                                onDragOver={canDragRow ? (e) => handleDragOver(e, row.id) : undefined}
                                onDragLeave={canDragRow ? handleDragLeave : undefined}
                                onDrop={canDragRow ? (e) => handleDrop(e, row.id) : undefined}
                                onDragEnd={canDragRow ? handleDragEnd : undefined}
                            >

                                {/* Name + subcategoryType badge */}
                                <div
                                    className="flex items-center border-r border-gray-300 cursor-pointer select-none gap-1 overflow-hidden"
                                    style={{
                                        paddingLeft: `${getRowDisplayDepth(row) * 14 + 6}px`, fontWeight: style.font
                                    }}
                                    onClick={() => openEditor(row.id)}
                                >
                                    {row.type === 'group' && (
                                        <button
                                            type="button"
                                            className="mr-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded cursor-pointer"
                                            title={isGroupReviewed ? `Bỏ đánh dấu rà soát (#${reviewedMarkerNumber})` : 'Đánh dấu rà soát'}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleReviewedGroup(row.id);
                                            }}
                                        >
                                            {isGroupReviewed ? (
                                                <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-emerald-500 px-[3px] text-[8px] font-bold leading-none text-white">
                                                    {reviewedMarkerNumber}
                                                </span>
                                            ) : null}
                                        </button>
                                    )}
                                    {hasChildren
                                        ? (
                                            <button
                                                type="button"
                                                className="shrink-0 flex items-center justify-center w-[14px] h-[14px] rounded hover:bg-gray-200 transition-colors"
                                                title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                                                onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
                                            >
                                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            </button>
                                        )
                                        : <span className="w-[14px] shrink-0" />}
                                    {shouldShowGroupInlinePhase && (
                                        <div className="mr-0.5 flex shrink-0 items-center gap-1">
                                            {groupInlinePhaseVisible.map(tag => (
                                                <span
                                                    key={`${row.id}-${tag.id}`}
                                                    className="rounded px-1 py-0 text-[9px] font-semibold"
                                                    title={`${tag.short}: ${tag.full}`}
                                                    style={{
                                                        backgroundColor: hexToRgba(tag.color, 0.18),
                                                        color: tag.color,
                                                    }}
                                                >
                                                    {tag.short}
                                                </span>
                                            ))}
                                            {groupInlinePhaseMore > 0 && (
                                                <span
                                                    className="rounded bg-indigo-50 px-1 py-0 text-[9px] font-semibold text-indigo-600"
                                                    title={groupInlinePhaseMoreTitle || `${groupInlinePhaseMore} more week(s)`}
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

                                {/* WorkType — only for group, hidden when showWorkType=false */}
                                {showWorkType && (
                                    <div
                                        data-worktype-trigger="true"
                                        className={`flex items-center justify-center border-r border-gray-300 px-1 relative ${canEditStructure && row.type === 'group' ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}`}
                                        style={{ width: COL_WORK_TYPE_W }}
                                        title={row.type === 'group' ? 'Click để đổi WorkType' : ''}
                                        onClick={e => {
                                            if (!canEditStructure || row.type !== 'group') return;
                                            e.stopPropagation();
                                            setOpenPriorityId(null);
                                            setOpenStatusId(null);
                                            setOpenPhaseId(null);
                                            captureDropdownAnchor(e);
                                            setOpenWorkTypeId(openWorkTypeId === row.id ? null : row.id);
                                        }}
                                    >
                                        {row.type === 'group' ? (
                                            <span
                                                className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                                style={{
                                                    backgroundColor: row.groupItemType ? GROUP_ITEM_TYPE_STYLE[row.groupItemType].bg : '#f3f4f6',
                                                    color: row.groupItemType ? GROUP_ITEM_TYPE_STYLE[row.groupItemType].text : '#9ca3af',
                                                }}
                                                title={row.groupItemType || 'Unset'}
                                            >
                                                {row.groupItemType || '—'}
                                            </span>
                                        ) : (
                                            <span className="mx-auto text-[10px] text-gray-300"> </span>
                                        )}

                                    </div>
                                )}

                                {/* Priority — only for group (plan: hide for category/subcategory/team) */}
                                {showPriority && (
                                    (row.type === 'group' || row.type === 'subcategory') ? (
                                        <div
                                            data-priority-trigger="true"
                                            className={`flex items-center justify-center border-r border-gray-300 px-1 relative ${canEditStructure ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}`}
                                            style={{ width: COL_PRIORITY_W }}
                                            title="Click để đổi priority"
                                            onClick={e => {
                                            if (!canEditStructure) return;
                                            e.stopPropagation();
                                            setOpenWorkTypeId(null);
                                            setOpenStatusId(null);
                                            setOpenPhaseId(null);
                                            captureDropdownAnchor(e);
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
                                        </div>
                                    ) : (
                                        <div className="border-r border-gray-300" style={{ width: COL_PRIORITY_W }} />
                                    )
                                )}

                                {/* Status — smart visibility: category=always hide, sub=hide when expanded (unless all groups have no status), group/team=always show */}
                                {(() => {
                                    const allChildrenNoStatus = row.type === 'subcategory'
                                        && row.children?.every(child => !child.status || child.status === 'None');
                                    const showStatusVisual = row.type === 'team'
                                        || row.type === 'group'
                                        || (row.type === 'subcategory' && (!isExpanded || allChildrenNoStatus))
                                        ;
                                    const canClickStatus = (row.type === 'team' || row.type === 'group' || row.type === 'subcategory')
                                        && rowPermission.canEditStatus;
                                    return (
                                        <div
                                            data-status-trigger="true"
                                            className={`flex items-center justify-center border-r border-gray-300 px-1 relative ${canClickStatus ? 'cursor-pointer hover:bg-black/5 transition-colors' : ((isOtherTeamRow || isNonEditableParentRow) ? 'cursor-pointer' : '')}`}
                                            onClick={e => {
                                                if (!canClickStatus && isManagerNonAdmin) {
                                                    e.stopPropagation();
                                                    if (isOtherTeamRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, e);
                                                    } else if (isNonEditableParentRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, e);
                                                    }
                                                    return;
                                                }
                                                if (!canClickStatus) return;
                                                e.stopPropagation();
                                                if (!isStatusInlineEditable) return;
                                                setOpenWorkTypeId(null);
                                                setOpenPriorityId(null);
                                                setOpenPhaseId(null);
                                                captureDropdownAnchor(e);
                                                setOpenStatusId(openStatusId === row.id ? null : row.id);
                                            }}
                                            title={!showStatusVisual
                                                    ? (canClickStatus ? 'Click để đổi status' : '')
                                                    : row.statusMode === 'auto'
                                                    ? 'Status đang auto từ task con. Click để mở Edit.'
                                                    : 'Click để đổi status'
                                            }
                                        >
                                            {!showStatusVisual ? (
                                                <span className="mx-auto text-[10px] text-transparent">&nbsp;</span>
                                            ) : row.statusMode === 'auto' ? (
                                                <span className="mx-auto text-[10px] text-gray-400 italic"></span>
                                            ) : row.status === 'None' ? (
                                                <span className="mx-auto text-[10px] text-transparent"></span>
                                            ) : (
                                                <span className="text-[10px] px-1 py-0.5 rounded font-semibold w-full text-center truncate"
                                                    style={{ backgroundColor: STATUS_TAG_BG[row.status] || '#f3f4f6', color: STATUS_TAG_TEXT[row.status] || '#374151' }}>
                                                    {row.status}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Custom columns cells */}
                                {customColumns.map(col => {
                                    const cellValue = row.extra?.[col.key] || '';
                                    const colW = col.width ?? DEFAULT_CUSTOM_COL_W;
                                    return (
                                        <div key={col.key}
                                            className="flex items-center border-r border-gray-300 px-1 cursor-pointer hover:bg-black/5 transition-colors"
                                            style={{ minWidth: colW, width: colW }}
                                            title={cellValue || `Click để nhập ${col.label}`}
                                            onClick={e => {
                                                if (!canEditStructure) return;
                                                e.stopPropagation();
                                                setExtraCellAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
                                                setEditingExtraCell({ rowId: row.id, colKey: col.key, value: cellValue });
                                            }}
                                        >
                                            <span className="text-[10px] text-gray-700 truncate w-full text-center">
                                                {cellValue || ''}
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* Week tags — show for group only */}
                                {showPhase && (
                                    row.type === 'group' ? (
                                        <div
                                            data-phase-trigger="true"
                                            className={`flex items-center border-r border-gray-300 px-1 relative ${canEditStructure && phaseOptions.length > 0 ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}`}
                                            title={rowPhaseTitle || 'Chưa gán week'}
                                            onClick={e => {
                                                if (!canEditStructure || phaseOptions.length === 0) return;
                                                e.stopPropagation();
                                                setOpenWorkTypeId(null);
                                                setOpenPriorityId(null);
                                                setOpenStatusId(null);
                                                captureDropdownAnchor(e);
                                                setOpenPhaseId(openPhaseId === row.id ? null : row.id);
                                            }}
                                        >
                                            {rowPhaseLabels.length === 0 ? (
                                                <span className="mx-auto text-[10px] text-gray-400">—</span>
                                            ) : (
                                                <div className="flex w-full items-center justify-center gap-1 overflow-hidden">
                                                    {rowPhaseChips.map((chip, idx) => (
                                                        <span
                                                            key={`${row.id}-${chip.id}-${idx}`}
                                                            className="truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-center"
                                                            style={{
                                                                backgroundColor: hexToRgba(chip.color, 0.18),
                                                                color: chip.color,
                                                            }}
                                                        >
                                                            {chip.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="border-r border-gray-300" style={{ width: phaseW }} />
                                    )
                                )}

                                {/* Start Date — show for subcategory + team only */}
                                {showStartDate && (
                                    (row.type === 'subcategory' || row.type === 'team' || row.type === 'group') ? (
                                        <div
                                            data-date-cell-trigger={isDateCellEditable ? 'true' : undefined}
                                            className={`flex items-center justify-center border-r border-gray-300 px-1 text-[10px] font-mono ${isDateCellEditable ? 'cursor-pointer text-blue-700 hover:bg-blue-50 hover:text-blue-800 transition-colors' : ((isOtherTeamRow || isNonEditableParentRow) ? 'cursor-pointer text-gray-500 hover:bg-black/5' : 'text-gray-500')}`}
                                            title={isDateCellEditable ? 'Click để sửa Start Date nhanh' : ''}
                                            onClick={(event) => {
                                                if (!isDateCellEditable && isManagerNonAdmin) {
                                                    event.stopPropagation();
                                                    if (isOtherTeamRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, event);
                                                    } else if (isNonEditableParentRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, event);
                                                    }
                                                    return;
                                                }
                                                if (isDateCellEditable) openDateMiniPopup(event, row, 'startDate');
                                            }}
                                        >
                                            {row.startDate ? format(parseISO(row.startDate), 'dd/MM/yy') : '-'}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center border-r border-gray-300 px-1 text-[10px] text-transparent">-</div>
                                    )
                                )}

                                {/* End Date — show for subcategory + team only */}
                                {showEndDate && (
                                    (row.type === 'subcategory' || row.type === 'team' || row.type === 'group') ? (
                                        <div
                                            data-date-cell-trigger={isDateCellEditable ? 'true' : undefined}
                                            className={`flex items-center justify-center border-r border-gray-300 px-1 text-[10px] font-mono ${isDateCellEditable ? 'cursor-pointer text-blue-700 hover:bg-blue-50 hover:text-blue-800 transition-colors' : ((isOtherTeamRow || isNonEditableParentRow) ? 'cursor-pointer text-gray-500 hover:bg-black/5' : 'text-gray-500')}`}
                                            title={isDateCellEditable ? 'Click để sửa End Date nhanh' : ''}
                                            onClick={(event) => {
                                                if (!isDateCellEditable && isManagerNonAdmin) {
                                                    event.stopPropagation();
                                                    if (isOtherTeamRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, event);
                                                    } else if (isNonEditableParentRow) {
                                                        showRestrictionFeedback(`Bạn chỉ có thể chỉnh sửa team ${currentUser!.team}`, event);
                                                    }
                                                    return;
                                                }
                                                if (isDateCellEditable) openDateMiniPopup(event, row, 'endDate');
                                            }}
                                        >
                                            {row.endDate ? format(parseISO(row.endDate), 'dd/MM/yy') : '-'}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center border-r border-gray-300 px-1 text-[10px] text-transparent">-</div>
                                    )
                                )}

                                {/* Version — only for group level */}
                                {showVersion && (
                                    row.type === 'group' ? (
                                        <div
                                            data-version-trigger="true"
                                            className={`flex items-center justify-center border-r border-gray-300 px-1 relative ${canEditStructure ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}`}
                                            style={{ width: COL_VERSION_W }}
                                            title="Click để đổi version"
                                            onClick={e => {
                                                if (!canEditStructure) return;
                                                e.stopPropagation();
                                                setOpenWorkTypeId(null);
                                                setOpenPriorityId(null);
                                                setOpenStatusId(null);
                                                setOpenPhaseId(null);
                                                captureDropdownAnchor(e);
                                                setOpenVersionId(openVersionId === row.id ? null : row.id);
                                            }}
                                        >
                                            <span
                                                className="text-[10px] px-1 py-0.5 rounded font-medium w-full text-center truncate"
                                                style={{
                                                    backgroundColor: row.version ? '#e0e7ff' : '#f3f4f6',
                                                    color: row.version ? '#4338ca' : '#9ca3af'
                                                }}
                                            >
                                                {row.version || '—'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="border-r border-gray-300" style={{ width: COL_VERSION_W }} />
                                    )
                                )}

                                {/* Actions */}
                                {canEditStructure && (
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
                </div>
            </div>
            )}

            {/* ── RIGHT PANE – GANTT ── */}
            <div ref={rightPaneRef} className="flex-1 overflow-auto relative" onScroll={handleScrollRight}>
                <div style={{ width: timelineCanvasWidth, minWidth: '100%' }}>

                    {/* ── STICKY HEADER ── */}
                    <div className="sticky top-0 z-20 flex flex-col" style={{ height: TOTAL_HEADER_H }}>

                        {/* Row 0: Milestone labels */}
                        <div className="relative flex border-b border-gray-300 bg-white shrink-0 overflow-hidden" style={{ height: MILESTONE_HEADER_H }}>
                            {timelineOnly && (
                                <div
                                    className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-white"
                                    style={{ width: timelineLeftOffset }}
                                />
                            )}
                            {timelineUnits.map((_, i) => <div key={i} className="shrink-0" style={{ width: timelineUnitWidth }} />)}
                            {milestoneRanges.map((m) => (
                                <div key={m.id} className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1"
                                    style={{ left: timelineLeftOffset + m.left, width: m.width, backgroundColor: m.color }} title={m.label}>
                                    {m.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 1: Week groups */}
                        <div className="relative flex border-b border-gray-400 bg-gray-200 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {timelineOnly && (
                                <div
                                    className="sticky left-0 z-30 flex shrink-0 items-center border-r border-gray-400 bg-gray-200 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 relative"
                                    style={{ width: timelineLeftOffset }}
                                >
                                    Task
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/30 z-10"
                                        onMouseDown={e => {
                                            e.stopPropagation();
                                            startResize(e, setTimelineTaskW, MIN_TIMELINE_TASK_W, MAX_TIMELINE_TASK_W);
                                        }}
                                        title="Kéo để thay đổi độ rộng cột Task"
                                    />
                                </div>
                            )}
                            {headerGroups.map((wk, i) => (
                                <div key={i} className="shrink-0 border-r border-gray-400 flex items-center px-1 text-[10px] font-bold text-gray-700 overflow-hidden"
                                    style={{ width: wk.count * timelineUnitWidth }}>
                                    {wk.label}
                                </div>
                            ))}
                        </div>

                        {/* Row 2: Days */}
                        <div className="relative flex border-b-2 border-gray-500 shrink-0" style={{ height: ROW_HEIGHT }}>
                            {timelineOnly && (
                                <div
                                    className="sticky left-0 z-30 shrink-0 border-r border-gray-300 bg-white"
                                    style={{ width: timelineLeftOffset }}
                                />
                            )}
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
                                style={{ left: timelineLeftOffset + todayIndex * timelineUnitWidth + timelineUnitWidth / 2, width: 2, backgroundColor: '#ef4444' }} />
                        )}

                        {/* Milestone column shading */}
                        {milestoneRanges.map(m => (
                            <div key={m.id} className="absolute top-0 bottom-0 pointer-events-none z-[2]"
                                style={{ left: timelineLeftOffset + m.left, width: m.width, backgroundColor: hexToRgba(m.color, 0.12) }} />
                        ))}

                        {/* Weekend shading */}
                        {timelineMode === 'day' && (
                            <div className="absolute inset-0 flex pointer-events-none">
                                {timelineOnly && (
                                    <div
                                        className="shrink-0 h-full border-r border-gray-100"
                                        style={{ width: timelineLeftOffset }}
                                    />
                                )}
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
                            const hasChildren = row.children && row.children.length > 0;
                            const isExpanded = expandedIds.has(row.id);
                            const displayDepth = getRowDisplayDepth(row);
                            let barLeft = -1, barWidth = 0, workdays = 0, sprintStr = '', isSingleDayBar = false;
                            if (row.startDate && row.endDate) {
                                const sd = parseISO(row.startDate);
                                const edRaw = parseISO(row.endDate);
                                if (!Number.isNaN(sd.getTime())) {
                                    const ed = Number.isNaN(edRaw.getTime()) ? sd : edRaw;
                                    isSingleDayBar = format(sd, 'yyyy-MM-dd') === format(ed, 'yyyy-MM-dd');
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
                                        barLeft = timelineLeftOffset + firstIdx * timelineUnitWidth;
                                        barWidth = (lastIdx - firstIdx + 1) * timelineUnitWidth;
                                        workdays = countWorkdays(sd, ed);

                                        const sprintsNum = calendarDays / 7;
                                        sprintStr = Number.isInteger(sprintsNum) ? sprintsNum.toString() : sprintsNum.toFixed(1);
                                    }
                                }
                            }
                            const depthStyle = DEPTH_STYLES[Math.min(row.depth, DEPTH_STYLES.length - 1)];
                            const barColor = STATUS_BAR_COLOR[row.status] || '#9ca3af';

                            const isGrowthCamp = row.type === 'subcategory' && row.subcategoryType === 'Growth Camp';

                            // ── Multi-segment bar: one segment per direct child with dates ──
                            const childSegments: { left: number; width: number; color: string; status: string; childName: string; teamRole?: string; startDate: string; endDate: string; isSingleDay: boolean }[] = [];
                            if (row.children && row.children.length > 0) {
                                for (const child of row.children) {
                                    if (!child.startDate || !child.endDate) continue;
                                    const csd = parseISO(child.startDate);
                                    const cedRaw = parseISO(child.endDate);
                                    if (Number.isNaN(csd.getTime())) continue;
                                    const ced = Number.isNaN(cedRaw.getTime()) ? csd : cedRaw;
                                    let cFirstIdx = -1, cLastIdx = -1;
                                    for (let i = 0; i < timelineUnits.length; i++) {
                                        const unit = timelineUnits[i];
                                        if (unit.end >= csd && unit.start <= ced) {
                                            if (cFirstIdx === -1) cFirstIdx = i;
                                            cLastIdx = i;
                                        }
                                    }
                                    if (cFirstIdx >= 0 && cLastIdx >= 0) {
                                        childSegments.push({
                                            left: timelineLeftOffset + cFirstIdx * timelineUnitWidth,
                                            width: (cLastIdx - cFirstIdx + 1) * timelineUnitWidth,
                                            color: STATUS_BAR_COLOR[child.status] || '#9ca3af',
                                            status: child.status,
                                            childName: child.name,
                                            teamRole: child.teamRole,
                                            startDate: child.startDate,
                                            endDate: child.endDate,
                                            isSingleDay: format(csd, 'yyyy-MM-dd') === format(ced, 'yyyy-MM-dd'),
                                        });
                                    }
                                }
                            }
                            const hasChildSegments = childSegments.length > 0 && row.type !== 'category' && row.type !== 'subcategory';
                            const segMinLeft = hasChildSegments ? Math.min(...childSegments.map(s => s.left)) : 0;
                            const segMaxRight = hasChildSegments ? Math.max(...childSegments.map(s => s.left + s.width)) : 0;
                            const segTotalWidth = segMaxRight - segMinLeft;
                            const layeredChildSegments = hasChildSegments ? sortArcsByWidth(childSegments) : [];

                            const hasActiveInfo = activeBarInfoId === row.id;
                            // Hide team (depth>=3) bars unless parent group/subcategory is expanded
                            // Team bars hidden by default — click any team row background to toggle ALL sibling team bars
                            const parentGroupId = row.type === 'team' ? row.parentIds[row.parentIds.length - 1] : null;
                            const isTeamBarHidden = row.type === 'team' && (!parentGroupId || !expandedBarIds.has(parentGroupId));

                            return (
                                <div key={row.id} className={`flex relative border-b border-gray-200 ${row.type === 'team' ? 'cursor-pointer' : ''}`}
                                    style={{ height: ROW_HEIGHT, backgroundColor: depthStyle.bg }}
                                    onMouseEnter={() => setHoveredRowId(row.id)}
                                    onMouseLeave={() => setHoveredRowId(prev => prev === row.id ? null : prev)}
                                    onClick={row.type === 'team' && parentGroupId ? () => {
                                        setExpandedBarIds(prev => {
                                            const n = new Set(prev);
                                            if (n.has(parentGroupId)) n.delete(parentGroupId);
                                            else n.add(parentGroupId);
                                            return n;
                                        });
                                    } : undefined}>
                                    {/* Row hover highlight overlay */}
                                    {hoveredRowId === row.id && (
                                        <div className="absolute inset-0 bg-black/5 pointer-events-none z-[1]" />
                                    )}
                                    {timelineOnly && (
                                        <div
                                            className={`sticky left-0 z-[12] flex h-full shrink-0 items-center border-r border-slate-200 px-2 ${hasChildren || canEditStructure ? 'cursor-pointer hover:brightness-95' : ''}`}
                                            style={{ width: timelineLeftOffset, backgroundColor: depthStyle.bg }}
                                            onClick={hasChildren || canEditStructure ? (e) => {
                                                e.stopPropagation();
                                                if (hasChildren) {
                                                    toggleExpand(row.id);
                                                    return;
                                                }
                                                openEditor(row.id);
                                            } : undefined}
                                            title={hasChildren
                                                ? (isExpanded ? 'Thu gọn children' : 'Mở rộng children')
                                                : canEditStructure ? `Mở editor: ${row.name}` : row.name
                                            }
                                        >
                                            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${displayDepth * 12 + 2}px` }}>
                                                {hasChildren
                                                    ? (isExpanded
                                                        ? <ChevronDown size={12} className="shrink-0 text-slate-500" />
                                                        : <ChevronRight size={12} className="shrink-0 text-slate-500" />)
                                                    : <span className="w-[12px] shrink-0" />}
                                                <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{row.name}</span>
                                            </div>
                                        </div>
                                    )}
                                    {isTeamBarHidden ? null : hasChildSegments ? (
                                        /* ── Multi-arc parent row ── */
                                        <div
                                            className="absolute inset-y-0 cursor-pointer hover:z-20 group-hover/gantt:z-10"
                                            style={{ left: segMinLeft, width: segTotalWidth, zIndex: hasActiveInfo ? 40 : 5 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setActiveBarClickX(e.clientX - rect.left);
                                                setActiveBarInfoId(prev => (prev === row.id ? null : row.id));
                                            }}
                                        >
                                            <svg
                                                width={segTotalWidth}
                                                height={ROW_HEIGHT}
                                                className="absolute inset-0"
                                                style={{ overflow: 'visible' }}
                                            >
                                                {/* ── Baseline axis: solid line from first dot → timeline end ── */}
                                                {(() => {
                                                    const axisBaseline = 6;
                                                    const axisColor = hasActiveInfo ? '#475569' : '#94a3b8';
                                                    const axisWidth = hasActiveInfo ? 2 : 1.9;
                                                    const timelineEndX = (timelineLeftOffset + timelineUnits.length * timelineUnitWidth) - segMinLeft;

                                                    // Find leftmost start dot
                                                    const firstSeg = childSegments.reduce((min, s) => s.left < min.left ? s : min, childSegments[0]);
                                                    const axisX1 = (firstSeg.left - segMinLeft) + getArcEndpointPadding(firstSeg.width, timelineUnitWidth);

                                                    return timelineEndX > axisX1 ? (
                                                        <line
                                                            x1={axisX1} y1={axisBaseline}
                                                            x2={timelineEndX} y2={axisBaseline}
                                                            stroke={axisColor}
                                                            strokeWidth={axisWidth}
                                                            opacity={1.0}
                                                            strokeLinecap="round"
                                                        />
                                                    ) : null;
                                                })()}
                                                {layeredChildSegments.map((seg, index) => {
                                                    const localLeft = seg.left - segMinLeft;
                                                    const arcPad = getArcEndpointPadding(seg.width, timelineUnitWidth);
                                                    return (
                                                        <TimelineArc
                                                            key={`${row.id}-${seg.childName}-${seg.startDate}-${seg.endDate}-${index}`}
                                                            startX={localLeft + arcPad}
                                                            endX={localLeft + Math.max(arcPad, seg.width - arcPad)}
                                                            color={seg.color}
                                                            rowHeight={ROW_HEIGHT}
                                                            arcHeight={calcLayeredArcHeight(index, layeredChildSegments.length, ROW_HEIGHT)}
                                                            isActive={hasActiveInfo}
                                                            forceDot={seg.isSingleDay}
                                                        />
                                                    );
                                                })}
                                            </svg>
                                            {hasActiveInfo && (() => {
                                                // ── Build ALL child segments from row.children (independent of visible timeline range) ──
                                                const allChildSegs: { color: string; status: string; childName: string; teamRole?: string; startDate: string; endDate: string }[] = [];
                                                if (row.children) {
                                                    for (const child of row.children) {
                                                        if (!child.startDate || !child.endDate) continue;
                                                        const cs = parseISO(child.startDate);
                                                        const ce = parseISO(child.endDate);
                                                        if (Number.isNaN(cs.getTime())) continue;
                                                        allChildSegs.push({
                                                            color: STATUS_BAR_COLOR[child.status] || '#9ca3af',
                                                            status: child.status,
                                                            childName: child.name,
                                                            teamRole: child.teamRole,
                                                            startDate: child.startDate,
                                                            endDate: child.endDate,
                                                        });
                                                    }
                                                }

                                                // ── Parent subcategory deadline (highest priority for date reference) ──
                                                const parentSubForDates = flattened.find(r => r.type === 'subcategory' && row.parentIds.includes(r.id));
                                                const subStartRaw = parentSubForDates?.startDate ? parseISO(parentSubForDates.startDate) : null;
                                                const subEndRaw = parentSubForDates?.endDate ? parseISO(parentSubForDates.endDate) : null;
                                                const subStartValid = subStartRaw && !Number.isNaN(subStartRaw.getTime()) ? subStartRaw : null;
                                                const subEndValid = subEndRaw && !Number.isNaN(subEndRaw.getTime()) ? subEndRaw : null;

                                                // ── Row's own dates (fallback #1) ──
                                                const sdRaw = row.startDate ? parseISO(row.startDate) : null;
                                                const edRaw = row.endDate ? parseISO(row.endDate) : null;
                                                const rowStartValid = sdRaw && !Number.isNaN(sdRaw.getTime()) ? sdRaw : null;
                                                const rowEndValid = edRaw && !Number.isNaN(edRaw.getTime()) ? edRaw : null;

                                                // ── Child team bounds (fallback #2: earliest start / latest end) ──
                                                const childDateBounds = allChildSegs.reduce<{
                                                    minStart: Date | null;
                                                    maxEnd: Date | null;
                                                }>((acc, seg) => {
                                                    const segStart = parseISO(seg.startDate);
                                                    const segEnd = parseISO(seg.endDate);
                                                    if (!Number.isNaN(segStart.getTime())) {
                                                        if (!acc.minStart || segStart < acc.minStart) acc.minStart = segStart;
                                                    }
                                                    if (!Number.isNaN(segEnd.getTime())) {
                                                        if (!acc.maxEnd || segEnd > acc.maxEnd) acc.maxEnd = segEnd;
                                                    }
                                                    return acc;
                                                }, { minStart: null, maxEnd: null });

                                                const isDoneStatus = (s: string) => !s || s === 'None' || s === 'Not Started' || s.includes('Done');

                                                // ── Line 1: Hard deadline của subcategory ──
                                                const hardDeadlineStart = subStartValid ?? rowStartValid;
                                                const hardDeadlineEnd = subEndValid ?? rowEndValid;
                                                const hardDeadlineLabel = (() => {
                                                    if (!hardDeadlineStart && !hardDeadlineEnd) return null;
                                                    const s = hardDeadlineStart ? format(hardDeadlineStart, 'dd/MM/yyyy') : '—';
                                                    const e = hardDeadlineEnd ? format(hardDeadlineEnd, 'dd/MM/yyyy') : '—';
                                                    const dur = hardDeadlineStart && hardDeadlineEnd
                                                        ? formatWorkdayDuration(countWorkdays(
                                                            new Date(hardDeadlineStart.getFullYear(), hardDeadlineStart.getMonth(), hardDeadlineStart.getDate()),
                                                            new Date(hardDeadlineEnd.getFullYear(), hardDeadlineEnd.getMonth(), hardDeadlineEnd.getDate())
                                                        ))
                                                        : null;
                                                    return { s, e, dur };
                                                })();

                                                // ── Line 2: Tổng hợp thời gian từ team (min start → max end) ──
                                                const teamAggLabel = (() => {
                                                    const s = childDateBounds.minStart;
                                                    const e = childDateBounds.maxEnd;
                                                    if (!s && !e) return null;
                                                    const sStr = s ? format(s, 'dd/MM/yyyy') : '—';
                                                    const eStr = e ? format(e, 'dd/MM/yyyy') : '—';
                                                    const dur = s && e
                                                        ? formatWorkdayDuration(countWorkdays(
                                                            new Date(s.getFullYear(), s.getMonth(), s.getDate()),
                                                            new Date(e.getFullYear(), e.getMonth(), e.getDate())
                                                        ))
                                                        : null;
                                                    return { s: sStr, e: eStr, dur };
                                                })();

                                                // Build team date map from segments
                                                const teamDateMap = new Map<string, { start: Date; end: Date; seg: typeof allChildSegs[0] }>();
                                                allChildSegs.forEach(seg => {
                                                    const s = parseISO(seg.startDate);
                                                    const e = parseISO(seg.endDate);
                                                    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
                                                        teamDateMap.set(seg.teamRole || seg.childName, { start: s, end: e, seg });
                                                    }
                                                });

                                                // Workflow GAP detection: BA → PD → Growth(opt) → BE↔FE → DevOps → QC
                                                // Store gaps keyed by "before which team" for inline rendering
                                                const gapBeforeTeam = new Map<string, React.ReactNode>();
                                                const checkGap = (fromTeam: string, toTeam: string, fromEnd: Date, toStart: Date, key: string, beforeTeam: string) => {
                                                    const gs = addDays(fromEnd, 1);
                                                    const ge = subDays(toStart, 1);
                                                    if (gs <= ge) {
                                                        const wd = countWorkdays(gs, ge);
                                                        if (wd > 0) {
                                                            const existing = gapBeforeTeam.get(beforeTeam);
                                                            const node = (
                                                                <div key={key} className="text-red-400 font-semibold px-1 py-0.5 rounded shadow-sm border border-red-500/30 bg-red-950/40 text-[9.5px] whitespace-nowrap mt-1 mb-1 flex items-center gap-1">
                                                                    <span>⚠️</span> GAP: {fromTeam} → {toTeam} ({formatWorkdayDuration(wd)})
                                                                </div>
                                                            );
                                                            if (existing) {
                                                                gapBeforeTeam.set(beforeTeam, <>{existing}{node}</>);
                                                            } else {
                                                                gapBeforeTeam.set(beforeTeam, node);
                                                            }
                                                        }
                                                    }
                                                };

                                                const ba = teamDateMap.get('BA');
                                                const pd = teamDateMap.get('PD');
                                                const growth = teamDateMap.get('Growth');
                                                const be = teamDateMap.get('BE');
                                                const fe = teamDateMap.get('FE');
                                                const devops = teamDateMap.get('DevOps');
                                                const qc = teamDateMap.get('QC');

                                                // Stage 1: BA → PD
                                                if (ba && pd) checkGap('BA', 'PD', ba.end, pd.start, 'wf-ba-pd', 'PD');
                                                // Stage 1: PD → Growth (optional)
                                                if (pd && growth) checkGap('PD', 'Growth', pd.end, growth.start, 'wf-pd-growth', 'Growth');
                                                // Stage 1→2: last spec team → BE, FE
                                                const lastSpec = growth || pd;
                                                const lastSpecName = growth ? 'Growth' : 'PD';
                                                if (lastSpec && be) checkGap(lastSpecName, 'BE', lastSpec.end, be.start, 'wf-spec-be', 'BE');
                                                if (lastSpec && fe) checkGap(lastSpecName, 'FE', lastSpec.end, fe.start, 'wf-spec-fe', 'FE');
                                                // Stage 2: BE ↔ FE (gap placed before the later team)
                                                if (be && fe) {
                                                    if (be.end < fe.start) checkGap('BE', 'FE', be.end, fe.start, 'wf-be-fe', 'FE');
                                                    else if (fe.end < be.start) checkGap('FE', 'BE', fe.end, be.start, 'wf-fe-be', 'BE');
                                                }
                                                // Stage 2→3: max(BE,FE) → DevOps
                                                const devEnd = be && fe ? (be.end > fe.end ? be.end : fe.end) : (be?.end || fe?.end);
                                                const devEndName = be && fe ? (be.end > fe.end ? 'BE' : 'FE') : (be ? 'BE' : 'FE');
                                                if (devEnd && devops) checkGap(devEndName, 'DevOps', devEnd, devops.start, 'wf-dev-devops', 'DevOps');
                                                // Stage 3: DevOps → QC
                                                if (devops && qc) checkGap('DevOps', 'QC', devops.end, qc.start, 'wf-devops-qc', 'QC');
                                                // Fallback: nếu không có DevOps, check max(BE,FE) → QC
                                                if (!devops && devEnd && qc) checkGap(devEndName, 'QC', devEnd, qc.start, 'wf-dev-qc', 'QC');

                                                // Render team list sorted by workflow order with inline GAP warnings
                                                const workflowOrder: string[] = ['BA', 'PD', 'Growth', 'BE', 'FE', 'DevOps', 'QC'];
                                                const sortedSegs = [...allChildSegs].sort((a, b) => {
                                                    const aIdx = workflowOrder.indexOf(a.teamRole || a.childName);
                                                    const bIdx = workflowOrder.indexOf(b.teamRole || b.childName);
                                                    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
                                                });

                                                // Also sort no-date children by workflow order
                                                const noDateChildren = row.children
                                                    ? [...row.children]
                                                        .filter(child => !(child.startDate && child.endDate))
                                                        .filter(child => !isDoneStatus(child.status || ''))
                                                        .sort((a, b) => {
                                                            const aIdx = workflowOrder.indexOf(a.teamRole || a.name);
                                                            const bIdx = workflowOrder.indexOf(b.teamRole || b.name);
                                                            return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
                                                        })
                                                    : [];

                                                // Build unified render list: interleave teams (with+without dates) by workflow order
                                                const renderItems: React.ReactNode[] = [];

                                                // Merge dated segments and no-date children into one workflow-ordered list
                                                const renderedTeams = new Set<string>();

                                                // Process each team in workflow order
                                                workflowOrder.forEach(teamName => {
                                                    // Insert GAP warning before this team if exists
                                                    const gapNode = gapBeforeTeam.get(teamName);
                                                    if (gapNode) renderItems.push(gapNode);

                                                    // Render dated segment for this team
                                                    const seg = sortedSegs.find(s => (s.teamRole || s.childName) === teamName);
                                                    if (seg) {
                                                        const curStart = parseISO(seg.startDate);
                                                        const curEnd = parseISO(seg.endDate);
                                                        if (!Number.isNaN(curStart.getTime()) && !Number.isNaN(curEnd.getTime())) {
                                                            const segStatusLabel = seg.status && seg.status !== 'None' ? seg.status : null;
                                                            renderItems.push(
                                                                <div key={`seg-${teamName}`} className="flex items-center justify-between py-0.5 whitespace-nowrap gap-4">
                                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                                        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                                                                        <span className="max-w-[120px] truncate">{seg.childName}{segStatusLabel ? <span className="text-gray-400 font-normal"> ({segStatusLabel})</span> : null}</span>
                                                                    </div>
                                                                    <span className="text-gray-300 font-medium shrink-0 tabular-nums">{format(curStart, 'dd/MM')} → {format(curEnd, 'dd/MM/yyyy')} ({formatWorkdayDuration(countWorkdays(curStart, curEnd))})</span>
                                                                </div>
                                                            );
                                                            renderedTeams.add(teamName);
                                                        }
                                                    }

                                                    // Render no-date child for this team
                                                    const noDateChild = noDateChildren.find(c => (c.teamRole || c.name) === teamName);
                                                    if (noDateChild && !renderedTeams.has(teamName)) {
                                                        const s = noDateChild.status || '';
                                                        const isInactive = !s || s === 'None';
                                                        const statusLabel = s && s !== 'None' ? s : null;
                                                        renderItems.push(
                                                            <div key={`nodate-${teamName}`} className="flex items-center justify-between py-0.5 whitespace-nowrap gap-4">
                                                                <div className="flex items-center gap-1.5 overflow-hidden">
                                                                    <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: STATUS_BAR_COLOR[s] || '#9ca3af' }} />
                                                                    <span className="max-w-[120px] truncate">{noDateChild.name}{statusLabel ? <span className="text-gray-400 font-normal"> ({statusLabel})</span> : null}</span>
                                                                </div>
                                                                <span className={`font-medium shrink-0 text-[9.5px] ${isInactive ? 'text-slate-500' : 'text-amber-400'}`}>Chưa input ngày</span>
                                                            </div>
                                                        );
                                                        renderedTeams.add(teamName);
                                                    }
                                                });

                                                // Render any remaining segments/children not in workflow order
                                                sortedSegs.forEach((seg) => {
                                                    const teamName = seg.teamRole || seg.childName;
                                                    if (renderedTeams.has(teamName)) return;
                                                    const curStart = parseISO(seg.startDate);
                                                    const curEnd = parseISO(seg.endDate);
                                                    if (!Number.isNaN(curStart.getTime()) && !Number.isNaN(curEnd.getTime())) {
                                                        const segStatusLabel = seg.status && seg.status !== 'None' ? seg.status : null;
                                                        renderItems.push(
                                                            <div key={`seg-other-${teamName}`} className="flex items-center justify-between py-0.5 whitespace-nowrap gap-4">
                                                                <div className="flex items-center gap-1.5 overflow-hidden">
                                                                    <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                                                                    <span className="max-w-[120px] truncate">{seg.childName}{segStatusLabel ? <span className="text-gray-400 font-normal"> ({segStatusLabel})</span> : null}</span>
                                                                </div>
                                                                <span className="text-gray-300 font-medium shrink-0 tabular-nums">{format(curStart, 'dd/MM')} → {format(curEnd, 'dd/MM/yyyy')} ({formatWorkdayDuration(countWorkdays(curStart, curEnd))})</span>
                                                            </div>
                                                        );
                                                        renderedTeams.add(teamName);
                                                    }
                                                });
                                                noDateChildren.forEach((child) => {
                                                    const teamName = child.teamRole || child.name;
                                                    if (renderedTeams.has(teamName)) return;
                                                    const s = child.status || '';
                                                    const isInactive = !s || s === 'None';
                                                    const statusLabel = s && s !== 'None' ? s : null;
                                                    renderItems.push(
                                                        <div key={`nodate-other-${teamName}`} className="flex items-center justify-between py-0.5 whitespace-nowrap gap-4">
                                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                                <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: STATUS_BAR_COLOR[s] || '#9ca3af' }} />
                                                                <span className="max-w-[120px] truncate">{child.name}{statusLabel ? <span className="text-gray-400 font-normal"> ({statusLabel})</span> : null}</span>
                                                            </div>
                                                            <span className={`font-medium shrink-0 text-[9.5px] ${isInactive ? 'text-slate-500' : 'text-amber-400'}`}>Chưa input ngày</span>
                                                        </div>
                                                    );
                                                });

                                                // Group's own status for display
                                                const groupStatus = row.status && row.status !== 'None' ? row.status : null;
                                                const groupStatusBg = groupStatus ? (STATUS_TAG_BG[groupStatus] || '#f3f4f6') : undefined;
                                                const groupStatusText = groupStatus ? (STATUS_TAG_TEXT[groupStatus] || '#374151') : undefined;

                                                return (
                                                    <div className="absolute z-20 top-full mt-1 bg-slate-900 border border-slate-700 text-white text-[10.5px] font-medium px-2.5 py-2 rounded-lg select-none pointer-events-none shadow-xl flex flex-col gap-1.5"
                                                        style={{ minWidth: 200, maxWidth: 380, left: activeBarClickX }}>
                                                        <div className="border-b border-slate-700 pb-1.5">
                                                            <div className="font-bold text-slate-100 text-[11px] mb-0.5 truncate">{row.name}</div>
                                                            {groupStatus && (
                                                                <span className="inline-block text-[9.5px] px-1.5 py-0.5 rounded font-semibold"
                                                                    style={{ backgroundColor: groupStatusBg, color: groupStatusText }}>
                                                                    {groupStatus}
                                                                </span>
                                                            )}
                                                            {hardDeadlineLabel ? (
                                                                <div className="mt-1 text-[9.5px] text-slate-300 tabular-nums">
                                                                    <span className="text-slate-500">Hard deadline:</span> {hardDeadlineLabel.s.slice(0, 5)} → {hardDeadlineLabel.e}{hardDeadlineLabel.dur && ` (${hardDeadlineLabel.dur})`}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1 text-[9.5px] text-slate-500 italic">Chưa có hard deadline</div>
                                                            )}
                                                            {teamAggLabel ? (
                                                                <div className="mt-0.5 text-[9.5px] text-slate-400 tabular-nums">
                                                                    <span className="text-slate-500">Team:</span> {teamAggLabel.s.slice(0, 5)} → {teamAggLabel.e}{teamAggLabel.dur && ` (${teamAggLabel.dur})`}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-0.5 text-[9.5px] text-slate-500 italic">Team chưa nhập ngày</div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            {renderItems}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ) : !hasChildSegments && (row.type === 'group' || row.type === 'team') && row.status && row.status !== 'None' && row.status !== 'Not Started' && barLeft < 0 ? (
                                        /* ── No drawable segments: warn insufficient data ── */
                                        <div
                                            className="absolute inset-y-0 flex items-center px-2"
                                            style={{ left: timelineLeftOffset + 4 }}
                                        >
                                            <span className="text-[9.5px] text-slate-400 italic">Insufficient date data to render timeline</span>
                                        </div>
                                    ) : (
                                        /* ── Single arc (leaf or no child dates) ── */
                                        barLeft >= 0 && (
                                            <div
                                                className="absolute inset-y-0 cursor-pointer transition-all hover:z-20 group-hover/gantt:z-10"
                                                style={{ left: barLeft, width: barWidth, zIndex: hasActiveInfo ? 40 : 5 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setActiveBarClickX(e.clientX - rect.left);
                                                    if (row.type === 'group' || row.type === 'subcategory') {
                                                        const isBarExpanded = expandedBarIds.has(row.id);
                                                        if (!isBarExpanded) {
                                                            setExpandedBarIds(prev => { const n = new Set(prev); n.add(row.id); return n; });
                                                        } else if (activeBarInfoId !== row.id) {
                                                            setActiveBarInfoId(row.id);
                                                        } else {
                                                            setActiveBarInfoId(null);
                                                            setExpandedBarIds(prev => { const n = new Set(prev); n.delete(row.id); return n; });
                                                        }
                                                    } else {
                                                        setActiveBarInfoId(prev => (prev === row.id ? null : row.id));
                                                    }
                                                }}
                                            >
                                                <svg
                                                    width={barWidth}
                                                    height={ROW_HEIGHT}
                                                    className="absolute inset-0"
                                                    style={{ overflow: 'visible' }}
                                                >
                                                    {/* ── Baseline axis for leaf/child arc → solid line to timeline end ── */}
                                                    {!isSingleDayBar && (() => {
                                                        const leafAxisY = 6;
                                                        const leafX1 = getArcEndpointPadding(barWidth, timelineUnitWidth);
                                                        const leafTimelineEndX = (timelineLeftOffset + timelineUnits.length * timelineUnitWidth) - barLeft;
                                                        return leafTimelineEndX > leafX1 ? (
                                                            <line
                                                                x1={leafX1} y1={leafAxisY}
                                                                x2={leafTimelineEndX} y2={leafAxisY}
                                                                stroke={hasActiveInfo ? '#475569' : '#94a3b8'}
                                                                strokeWidth={hasActiveInfo ? 2 : 1.9}
                                                                opacity={1.0}
                                                                strokeLinecap="round"
                                                            />
                                                        ) : null;
                                                    })()}
                                                    <TimelineArc
                                                        startX={getArcEndpointPadding(barWidth, timelineUnitWidth)}
                                                        endX={Math.max(getArcEndpointPadding(barWidth, timelineUnitWidth), barWidth - getArcEndpointPadding(barWidth, timelineUnitWidth))}
                                                        color={barColor}
                                                        rowHeight={ROW_HEIGHT}
                                                        isActive={hasActiveInfo}
                                                        forceDot={isSingleDayBar}
                                                        strokeDasharray={isGrowthCamp ? '4 3' : undefined}
                                                    />
                                                </svg>
                                                {isGrowthCamp && <span className="absolute left-1 bottom-[1px] text-[10px] pointer-events-none">🚀</span>}
                                                {hasActiveInfo && (
                                                    <div className="absolute z-20 top-full mt-1 bg-gray-900/90 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap select-none pointer-events-none shadow-md"
                                                        style={{ left: activeBarClickX }}>
                                                        <div>{row.name}</div>
                                                        {row.startDate && <div>Start {row.startDate}</div>}
                                                        {row.endDate && <div>End {row.endDate} {workdays > 0 ? `(${formatWorkdayDuration(workdays)})` : ''}</div>}
                                                        <div>
                                                            {sprintStr} sprint · {row.progress}%
                                                            {row.type === 'category' || row.type === 'subcategory' ? '' : ` · ${row.status}`}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            </>
            )}

            {activeNotePreview && activeNoteItem && (
                <div
                    data-quick-note-popover="true"
                    className="fixed z-50 w-[320px] rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-xs"
                    style={{ top: activeNotePreview.top, left: activeNotePreview.left }}
                >
                    {!!activeNotePermission?.canEditNotes ? (
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

                    {!!activeNotePermission?.canEditNotes && isQuickNoteEditing ? (
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

            {activeImagePreviewId && activeImagePreviewImage && activeImagePreviewItem && (
                <div className="fixed inset-0 z-[70] flex items-stretch" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <button
                        type="button"
                        aria-label="Đóng xem ảnh"
                        className="flex-1 bg-black/50"
                        onClick={closeImagePreview}
                    />
                    {/* Viewer panel */}
                    <div className="flex h-full w-[min(96vw,1020px)] flex-col border-l border-slate-200 bg-white shadow-2xl">
                        {/* Header */}
                        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-slate-900">{activeImagePreviewItem.name}</p>
                                <p className="truncate text-[11px] text-slate-500">
                                    {activeImagePreviewImage.name || `Ảnh ${normalizedActiveImagePreviewIndex + 1}`}
                                    {activeImagePreviewImages.length > 1 && ` · ${normalizedActiveImagePreviewIndex + 1}/${activeImagePreviewImages.length}`}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {activeImagePreviewImages.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            aria-label="Ảnh trước"
                                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100"
                                            onClick={showPrevPreviewImage}
                                        >
                                            <ChevronLeft size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Ảnh kế"
                                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100"
                                            onClick={showNextPreviewImage}
                                        >
                                            <ChevronRight size={15} />
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    aria-label="Đóng xem ảnh"
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100"
                                    onClick={closeImagePreview}
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <div className="grid h-full grid-cols-[minmax(0,1fr)_300px]">
                                {/* Left: hero image + thumbnail strip */}
                                <div className="flex min-h-0 flex-col gap-2 overflow-hidden bg-[#F7F8FA] p-3">
                                    {/* Hero */}
                                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                        {activeViewerImageHasError ? (
                                            <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-100 text-center text-xs font-semibold text-slate-500">
                                                Lỗi tải ảnh
                                            </div>
                                        ) : (
                                            <img
                                                src={activeImagePreviewImage.url}
                                                alt={activeImagePreviewName}
                                                className="h-full w-full object-contain"
                                                onLoad={() => setActiveViewerImageHasError(false)}
                                                onError={() => setActiveViewerImageHasError(true)}
                                            />
                                        )}
                                    </div>
                                    {/* Thumbnail strip */}
                                    {activeImagePreviewImages.length > 1 && (
                                        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
                                            {activeImagePreviewImages.map((image, index) => {
                                                const isActive = index === normalizedActiveImagePreviewIndex;
                                                return (
                                                    <button
                                                        key={image.id}
                                                        type="button"
                                                        className={`shrink-0 overflow-hidden rounded-lg border-2 transition-all ${isActive
                                                            ? 'border-amber-500 shadow-md ring-2 ring-amber-200'
                                                            : 'border-slate-200 hover:border-slate-400'
                                                            }`}
                                                        onClick={() => setActiveImagePreviewIndex(index)}
                                                        title={image.name || `Ảnh ${index + 1}`}
                                                    >
                                                        <img
                                                            src={image.url}
                                                            alt={image.name || `Ảnh ${index + 1}`}
                                                            className="h-16 w-14 object-cover"
                                                            loading="lazy"
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Right: metadata panel */}
                                <div className="flex flex-col overflow-hidden border-l border-slate-200 bg-white">
                                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
                                        {/* Feedback messages */}
                                        {!effectiveDocumentPermission.canEditStatus && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                                Viewer mode - Dang nhap dung team de chinh status va note.
                                            </div>
                                        )}
                                        {viewerInlineSaveFeedback && (
                                            <div
                                                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${viewerInlineSaveFeedback.state === 'saving'
                                                    ? 'animate-pulse border-amber-200 bg-amber-50 text-amber-700'
                                                    : viewerInlineSaveFeedback.state === 'success'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-rose-200 bg-rose-50 text-rose-700'
                                                    }`}
                                            >
                                                {viewerInlineSaveFeedback.message}
                                            </div>
                                        )}

                                        {/* Item info */}
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Item</p>
                                            <p className="text-sm font-bold text-[#0B132B] leading-snug">{activeImagePreviewItem.name}</p>
                                            <p className="mt-0.5 text-[11px] text-[#64748B]">
                                                {activeImagePreviewPhaseLabels.length > 0
                                                    ? activeImagePreviewPhaseLabels.join(', ')
                                                    : 'No week'}
                                            </p>
                                        </div>

                                        {/* Status */}
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Status</p>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    data-status-trigger="true"
                                                    disabled={!isActiveImageStatusInlineEditable}
                                                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors ${isActiveImageStatusInlineEditable
                                                        ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-amber-400'
                                                        : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                                        }`}
                                                    onClick={e => {
                                                        if (!isActiveImageStatusInlineEditable) return;
                                                        e.stopPropagation();
                                                        setOpenPhaseId(null);
                                                        setOpenStatusId(openStatusId === activeImagePreviewItem.id ? null : activeImagePreviewItem.id);
                                                    }}
                                                >
                                                    <span
                                                        className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                                                        style={activeImagePreviewStatus === 'None' ? { color: '#9ca3af' } : {
                                                            backgroundColor: STATUS_TAG_BG[activeImagePreviewStatus] || '#f3f4f6',
                                                            color: STATUS_TAG_TEXT[activeImagePreviewStatus] || '#374151'
                                                        }}
                                                    >
                                                        {activeImagePreviewStatus === 'None' ? '—' : activeImagePreviewStatus}
                                                    </span>
                                                    <ChevronDown size={13} className="shrink-0 text-slate-400" />
                                                </button>
                                                {isActiveImageStatusInlineEditable && openStatusId === activeImagePreviewItem.id && (
                                                    <div data-status-dropdown="true" className="absolute left-0 top-full z-50 mt-1 w-full overflow-y-auto max-h-[360px] rounded-xl border border-slate-200 bg-white shadow-xl">
                                                        {getStatusOptionsForRow(activeImagePreviewItem, roadmapConfig).map(statusOption => (
                                                            <button
                                                                key={statusOption}
                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors hover:bg-slate-50"
                                                                onMouseDown={e => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    updateActivePreviewItemWithSaveFeedback(
                                                                        source => ({
                                                                            ...source,
                                                                            statusMode: 'manual',
                                                                            manualStatus: statusOption,
                                                                            status: statusOption,
                                                                        }),
                                                                        [{ itemId: activeImagePreviewItem.id, field: 'status', value: statusOption }]
                                                                    );
                                                                    setOpenStatusId(null);
                                                                }}
                                                            >
                                                                <span
                                                                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                                                                    style={statusOption === 'None' ? { color: '#9ca3af' } : { backgroundColor: STATUS_TAG_BG[statusOption] || '#f3f4f6', color: STATUS_TAG_TEXT[statusOption] || '#374151' }}
                                                                >
                                                                    {statusOption === 'None' ? '—' : statusOption}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Week */}
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Week</p>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    data-phase-trigger="true"
                                                    disabled={!canEditActiveImagePhase}
                                                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition-colors ${canEditActiveImagePhase
                                                        ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-amber-400'
                                                        : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                                        }`}
                                                    onClick={e => {
                                                        if (!canEditActiveImagePhase) return;
                                                        e.stopPropagation();
                                                        setOpenStatusId(null);
                                                        setOpenPhaseId(openPhaseId === activeImagePreviewItem.id ? null : activeImagePreviewItem.id);
                                                    }}
                                                >
                                                    <span className="truncate">
                                                        {activeImagePreviewPhaseLabels.length === 0
                                                            ? <span className="text-slate-400">None</span>
                                                            : activeImagePreviewPhaseLabels.join(', ')}
                                                    </span>
                                                    <ChevronDown size={13} className="shrink-0 text-slate-400" />
                                                </button>
                                                {canEditActiveImagePhase && openPhaseId === activeImagePreviewItem.id && (
                                                    <div data-phase-dropdown="true" className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                                                        <div className="max-h-52 overflow-y-auto py-1">
                                                            {phaseOptions.map((phase, index) => {
                                                                const isSelected = activeImagePreviewPhaseIdSet.has(phase.id);
                                                                const weekColor = normalizeWeekColor(phase.color, index);
                                                                return (
                                                                    <button
                                                                        key={phase.id}
                                                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${isSelected ? 'font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                                                                        style={isSelected ? { backgroundColor: hexToRgba(weekColor, 0.14), color: weekColor } : undefined}
                                                                        onMouseDown={e => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            updateActivePreviewItemWithSaveFeedback(
                                                                                source => {
                                                                                    const current = new Set(normalizePhaseIds(source.phaseIds));
                                                                                    if (current.has(phase.id)) current.delete(phase.id);
                                                                                    else current.add(phase.id);
                                                                                    const next = { ...source };
                                                                                    const nextPhaseIds = Array.from(current);
                                                                                    if (nextPhaseIds.length > 0) next.phaseIds = nextPhaseIds;
                                                                                    else delete next.phaseIds;
                                                                                    return next;
                                                                                }
                                                                            );
                                                                        }}
                                                                    >
                                                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: weekColor }} />
                                                                        <span className={`h-3.5 w-3.5 shrink-0 rounded border text-[10px] leading-[13px] text-center ${isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 text-transparent'}`}>✓</span>
                                                                        <span className="truncate">{phase.label}{!phase.hasSchedule ? ' (Unscheduled)' : ''}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="border-t border-slate-100">
                                                            <button
                                                                className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                                                                onMouseDown={e => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    updateActivePreviewItemWithSaveFeedback(source => {
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
                                        </div>

                                        {/* Note */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Note</p>
                                                <span className="text-[10px] text-slate-400">{imagePreviewNoteDraft.length}/{MAX_QUICK_NOTE_LENGTH}</span>
                                            </div>
                                            <textarea
                                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-700 resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 placeholder:text-slate-400 disabled:opacity-60"
                                                rows={4}
                                                maxLength={MAX_QUICK_NOTE_LENGTH}
                                                value={imagePreviewNoteDraft}
                                                placeholder="Thêm ghi chú..."
                                                onChange={e => setImagePreviewNoteDraft(e.target.value.slice(0, MAX_QUICK_NOTE_LENGTH))}
                                                onBlur={handleImagePreviewNoteSave}
                                                disabled={!canEditActiveImageNote}
                                            />
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="shrink-0 border-t border-slate-200 px-4 py-3 flex flex-col gap-2">
                                        {canEditStructure && (
                                            <button
                                                type="button"
                                                className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-amber-600"
                                                onClick={() => {
                                                    const editingId = activeImagePreviewItem.id;
                                                    setResumeViewerAfterEdit({
                                                        itemId: editingId,
                                                        imageIndex: Math.max(0, normalizedActiveImagePreviewIndex),
                                                    });
                                                    closeImagePreview();
                                                    openEditor(editingId);
                                                }}
                                            >
                                                Open Full Edit
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                                            onClick={closeImagePreview}
                                        >
                                            Đóng
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {dateMiniPopup && (
                <DateMiniPopup
                    key={`${dateMiniPopup.itemId}-${dateMiniPopup.field}-${dateMiniPopup.value || ''}`}
                    label={dateMiniPopup.field === 'startDate' ? 'Start Date' : 'End Date'}
                    value={dateMiniPopup.value}
                    anchorRect={dateMiniPopup.anchorRect}
                    comparisonValue={dateMiniPopup.siblingValue}
                    comparisonMode={dateMiniPopup.field === 'startDate' ? 'greater_than' : 'less_than'}
                    onSave={(newDate) => {
                        applyEditableFieldChanges(
                            dateMiniPopup.itemId,
                            [{ itemId: dateMiniPopup.itemId, field: dateMiniPopup.field, value: newDate ?? null }],
                            source => {
                                const next = { ...source };
                                if (newDate) next[dateMiniPopup.field] = newDate;
                                else delete next[dateMiniPopup.field];
                                return next;
                            }
                        );
                        setDateMiniPopup(null);
                    }}
                    onClose={() => setDateMiniPopup(null)}
                />
            )}

            {/* ── Portal-based dropdown menus (rendered outside scroll container to avoid clipping) ── */}
            {(() => {
                const activeId = openWorkTypeId || openPriorityId || openVersionId || openStatusId || openPhaseId;
                if (!activeId || !dropdownAnchorRect) return null;

                const dir = dropdownAnchorRect.top < 220 ? 'down' : 'up';
                const style: React.CSSProperties = {
                    position: 'fixed',
                    left: dropdownAnchorRect.left,
                    zIndex: 9999,
                    ...(dir === 'up'
                        ? { bottom: window.innerHeight - dropdownAnchorRect.top + 2 }
                        : { top: dropdownAnchorRect.bottom + 2 }),
                };

                const activeRow = flattened.find(r => r.id === activeId);

                // WorkType dropdown
                if (openWorkTypeId && activeRow) {
                    return createPortal(
                        <div data-worktype-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg min-w-[150px]" style={style}>
                            <div className="max-h-52 overflow-auto py-1">
                                {GROUP_ITEM_TYPE_OPTIONS.map(typeOption => (
                                    <button
                                        key={typeOption}
                                        className={`flex w-full items-center px-3 py-1.5 text-left text-[11px] transition-colors ${activeRow.groupItemType === typeOption ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            updateFromSource(activeRow.id, source => ({ ...source, groupItemType: typeOption }));
                                            setOpenWorkTypeId(null);
                                        }}
                                    >{typeOption}</button>
                                ))}
                            </div>
                            <div className="border-t border-gray-100">
                                <button
                                    className="w-full px-3 py-1.5 text-left text-[11px] text-gray-500 transition-colors hover:bg-gray-50"
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.groupItemType; return next; });
                                        setOpenWorkTypeId(null);
                                    }}
                                >Clear</button>
                            </div>
                        </div>,
                        document.body
                    );
                }

                // Priority dropdown
                if (openPriorityId && activeRow) {
                    const PRIORITY_COLORS: Record<string, string> = { High: '#dc2626', Medium: '#d97706', Low: '#16a34a', Reported: '#be185d' };
                    return createPortal(
                        <div data-priority-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg flex flex-col min-w-[90px]" style={style}>
                            {PRIORITY_LEVELS.map(p => (
                                <button key={p} className="text-left text-[11px] px-3 py-1.5 font-bold hover:bg-gray-50 transition-colors"
                                    style={{ color: PRIORITY_COLORS[p] }}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        updateFromSource(activeRow.id, source => ({ ...source, priority: p }), true);
                                        setOpenPriorityId(null);
                                    }}
                                >{p}</button>
                            ))}
                            <button className="text-left text-[11px] px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                onMouseDown={e => {
                                    e.preventDefault();
                                    updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.priority; return next; }, true);
                                    setOpenPriorityId(null);
                                }}
                            >Clear</button>
                        </div>,
                        document.body
                    );
                }

                // Version dropdown
                if (openVersionId && activeRow) {
                    return createPortal(
                        <div data-version-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg flex flex-col min-w-[120px]" style={style}>
                            <div className="px-2 py-1.5 border-b border-gray-100">
                                <input
                                    autoFocus
                                    className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    placeholder="Nhập version..."
                                    defaultValue={activeRow.version || ''}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value.trim();
                                            if (val) {
                                                updateFromSource(activeRow.id, source => ({ ...source, version: val }), true);
                                            } else {
                                                updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.version; return next; }, true);
                                            }
                                            setOpenVersionId(null);
                                        }
                                        if (e.key === 'Escape') setOpenVersionId(null);
                                    }}
                                />
                            </div>
                            {allVersions.length > 0 && (
                                <div className="max-h-40 overflow-auto py-0.5">
                                    {allVersions.map(v => (
                                        <button key={v} className={`flex w-full text-left text-[11px] px-3 py-1.5 font-medium hover:bg-gray-50 transition-colors ${activeRow.version === v ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
                                            onMouseDown={e => {
                                                e.preventDefault();
                                                updateFromSource(activeRow.id, source => ({ ...source, version: v }), true);
                                                setOpenVersionId(null);
                                            }}
                                        >{v}</button>
                                    ))}
                                </div>
                            )}
                            <button className="text-left text-[11px] px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                onMouseDown={e => {
                                    e.preventDefault();
                                    updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.version; return next; }, true);
                                    setOpenVersionId(null);
                                }}
                            >Clear</button>
                        </div>,
                        document.body
                    );
                }

                // Status dropdown
                if (openStatusId && activeRow) {
                    return createPortal(
                        <div data-status-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg flex flex-col min-w-[188px] max-h-[360px] overflow-y-auto" style={style}>
                            <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 truncate">
                                Hiện tại: <span className="font-semibold" style={{ color: activeRow.status && activeRow.status !== 'None' ? (STATUS_TAG_TEXT[activeRow.status] || '#374151') : '#9ca3af' }}>
                                    {activeRow.status && activeRow.status !== 'None' ? activeRow.status : '—'}
                                </span>
                            </div>
                            {getStatusOptionsForRow(activeRow, roadmapConfig).map(statusOption => (
                                <button
                                    key={statusOption}
                                    className={`text-left text-[11px] px-3 py-1.5 font-semibold hover:bg-gray-50 transition-colors ${statusOption === activeRow.status ? 'bg-blue-50' : ''}`}
                                    style={statusOption === 'None' ? { color: '#9ca3af' } : { color: STATUS_TAG_TEXT[statusOption] || '#374151' }}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        applyEditableFieldChanges(
                                            activeRow.id,
                                            [{ itemId: activeRow.id, field: 'status', value: statusOption }],
                                            source => ({
                                                ...source,
                                                statusMode: 'manual',
                                                manualStatus: statusOption,
                                                status: statusOption,
                                            })
                                        );
                                        setOpenStatusId(null);
                                    }}
                                >
                                    {statusOption === 'None' ? '—' : statusOption}
                                </button>
                            ))}
                        </div>,
                        document.body
                    );
                }

                // Phase dropdown
                if (openPhaseId && activeRow) {
                    const activePhaseIdSet = new Set(normalizePhaseIds(activeRow.phaseIds));
                    return createPortal(
                        <div data-phase-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg min-w-[200px] max-w-[260px]" style={style}>
                            <div className="max-h-52 overflow-auto py-1">
                                {phaseOptions.map((phase, index) => {
                                    const isSelected = activePhaseIdSet.has(phase.id);
                                    const weekColor = normalizeWeekColor(phase.color, index);
                                    return (
                                        <button
                                            key={phase.id}
                                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${isSelected ? 'font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                            style={isSelected ? { backgroundColor: hexToRgba(weekColor, 0.14), color: weekColor } : undefined}
                                            onMouseDown={e => {
                                                e.preventDefault();
                                                updateFromSource(activeRow.id, source => {
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
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: weekColor }} />
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
                                        updateFromSource(activeRow.id, source => { const next = { ...source }; delete next.phaseIds; return next; });
                                        setOpenPhaseId(null);
                                    }}
                                >Clear</button>
                            </div>
                        </div>,
                        document.body
                    );
                }

                return null;
            })()}


            {/* ── Extra cell inline editor portal ── */}
            {editingExtraCell && extraCellAnchorRect && (() => {
                const colDef = customColumns.find(c => c.key === editingExtraCell.colKey);
                if (!colDef) return null;
                const dir = extraCellAnchorRect.top < 220 ? 'down' : 'up';
                const portalStyle: React.CSSProperties = {
                    position: 'fixed',
                    left: extraCellAnchorRect.left,
                    zIndex: 9999,
                    ...(dir === 'up'
                        ? { bottom: window.innerHeight - extraCellAnchorRect.top + 2 }
                        : { top: extraCellAnchorRect.bottom + 2 }),
                };
                const commitValue = (val: string) => {
                    const trimmed = val.trim();
                    updateFromSource(editingExtraCell.rowId, source => {
                        const nextExtra = { ...(source.extra ?? {}) };
                        if (trimmed) {
                            nextExtra[editingExtraCell.colKey] = trimmed;
                        } else {
                            delete nextExtra[editingExtraCell.colKey];
                        }
                        return { ...source, extra: Object.keys(nextExtra).length > 0 ? nextExtra : undefined };
                    }, true);
                    setEditingExtraCell(null);
                    setExtraCellAnchorRect(null);
                };
                const dismiss = () => { setEditingExtraCell(null); setExtraCellAnchorRect(null); };

                if (colDef.type === 'dropdown' && colDef.options?.length) {
                    return createPortal(
                        <div data-extra-dropdown="true" className="rounded border border-gray-200 bg-white shadow-lg flex flex-col min-w-[120px]" style={portalStyle}>
                            <div className="max-h-48 overflow-auto py-0.5">
                                {colDef.options.map(opt => (
                                    <button key={opt}
                                        className={`flex w-full text-left text-[11px] px-3 py-1.5 font-medium hover:bg-gray-50 transition-colors ${editingExtraCell.value === opt ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
                                        onMouseDown={e => { e.preventDefault(); commitValue(opt); }}
                                    >{opt}</button>
                                ))}
                            </div>
                            <button className="text-left text-[11px] px-3 py-1.5 text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                onMouseDown={e => { e.preventDefault(); commitValue(''); }}
                            >Clear</button>
                        </div>,
                        document.body
                    );
                }

                // Text input (default)
                return createPortal(
                    <div data-extra-input="true" className="rounded border border-gray-200 bg-white shadow-lg p-1.5 min-w-[140px]" style={portalStyle}>
                        <input
                            autoFocus
                            className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            placeholder={`Nhập ${colDef.label}...`}
                            defaultValue={editingExtraCell.value}
                            onKeyDown={e => {
                                if (e.key === 'Enter') commitValue((e.target as HTMLInputElement).value);
                                if (e.key === 'Escape') dismiss();
                            }}
                            onBlur={e => commitValue(e.target.value)}
                        />
                    </div>,
                    document.body
                );
            })()}

            {/* Team Restriction Feedback Tooltip */}
            {teamRestrictionFeedback && createPortal(
                <div
                    className="fixed z-[9999] px-1.5 py-0.5 bg-[#ffffe0] border border-black text-black text-[11px] font-sans shadow-sm pointer-events-none"
                    style={{ left: teamRestrictionFeedback.x + 10, top: teamRestrictionFeedback.y + 15 }}
                >
                    {teamRestrictionFeedback.message}
                </div>,
                document.body
            )}
        </div>
    );
}
