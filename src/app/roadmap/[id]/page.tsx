'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { startOfDay, subWeeks, subMonths, addMonths, endOfMonth, startOfMonth, format } from 'date-fns';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Toolbar, { type QuickViewMode } from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import MilestoneEditor from '@/components/MilestoneEditor';
import FilterPopup from '@/components/FilterPopup';
import ReportsPanel from '@/components/ReportsPanel';
import ReportPopup from '@/components/ReportPopup';
import TimelineModeFab from '@/components/TimelineModeFab';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoginForm } from '@/components/LoginForm';
import { useToast } from '@/hooks/useToast';
import { LocalBackupBanner } from '@/components/LocalBackupBanner';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import type { EditPermission, ManagerFieldChange } from '@/types/auth';
import type { Report } from '@/types/report';
import {
  ColumnWidthMode,
  Milestone,
  PhaseOption,
  RoadmapConfig,
  RoadmapDocument,
  RoadmapItem,
  RoadmapViewSettings,
  DEFAULT_ROADMAP_CONFIG,
  TimelineMode,
  normalizeItemImages,
  normalizeGroupItemType,
  normalizeGroupItemTypeFilter,
  normalizeItemPriority,
  normalizeItemType,
  normalizePhaseFilterValues,
  normalizePhaseIds,
  normalizePriorityFilterValues,
  normalizeWeekColor,
  normalizeWeekLabel,
  normalizeStatusFilter,
  toLegacyImageFields
} from '@/types/roadmap';
import type {
  AdminItemFieldChange,
  RoadmapAdminItemPatchRequest,
  RoadmapAdminPatchRequest,
  RoadmapManagerSaveRequest,
  RoadmapSaveRequest,
} from '@/types/roadmapSave';
import { buildRoadmapExcelFile, downloadExcelFile, type ExcelExportColumn } from '@/utils/exportToExcel';
import {
  buildRoadmapChannelName,
  isVersionNewer,
} from '@/utils/roadmapConcurrency';
import { normalizeMilestoneDateValue, normalizeMilestonesForSave } from '@/utils/milestones';
import {
  filterRoadmapTree,
  flattenRoadmap,
  getVisibleFlattenedRows,
  normalizeRoadmapItemTimestamps,
  recalculateRoadmap
} from '@/utils/roadmapHelpers';
import {
  ensureReportedPriority,
  removeReportedPriority,
  resolveReportedSourceRoadmapId,
} from '@/utils/reportedMode';
import {
  applyDatesByAllPhases,
  applyDatesByPhase,
  type ApplyPhaseDatesResult,
  type PhaseDateAffectedGroup,
} from '@/utils/phaseDateApply';
import { getDocumentPermission } from '@/utils/permissions';
import { buildViewSettingsStorageKey, parseStoredViewSettings, stripViewSettingsFromDocument } from '@/utils/roadmapViewSettings';
import type {
    QuickFilterState,
    QuickFilterStatusState,
    QuickFilterTeamState,
    QuickFilterPriorityState,
    QuickFilterMode,
} from '@/types/quickFilter';
import {
    EMPTY_QUICK_FILTER_STATUS,
    EMPTY_QUICK_FILTER_TEAM,
    EMPTY_QUICK_FILTER_PRIORITY,
} from '@/types/quickFilter';

const DEFAULT_FEATURES_COL_WIDTH = 260;
const MIN_FEATURES_COL_WIDTH = 120;
const MAX_FEATURES_COL_WIDTH = 450;
const DEFAULT_TIMELINE_MODE: TimelineMode = 'day';
const DEFAULT_TIMELINE_TASK_WIDTH = 220;
const MIN_TIMELINE_TASK_WIDTH = 140;
const MAX_TIMELINE_TASK_WIDTH = 420;
const VERSION_POLL_INTERVAL_MS = 20_000;


function clampFeaturesColWidth(width: number): number {
  return Math.max(MIN_FEATURES_COL_WIDTH, Math.min(MAX_FEATURES_COL_WIDTH, width));
}

function clampTimelineTaskWidth(width: number): number {
  return Math.max(MIN_TIMELINE_TASK_WIDTH, Math.min(MAX_TIMELINE_TASK_WIDTH, width));
}

function normalizeDateValue(value: string | undefined): string {
  return normalizeMilestoneDateValue(value);
}



function stripQuickViewSubcategories(subcategories: string[]): string[] {
  const next = new Set(subcategories);
  const hasWebQuick = next.has('Web') && next.has('Core');
  const hasAppQuick = next.has('App') && next.has('Core');
  if (!hasWebQuick && !hasAppQuick) return subcategories;
  next.delete('Web');
  next.delete('App');
  next.delete('Core');
  return Array.from(next);
}

function normalizeMilestones(milestones: Milestone[] | undefined): Milestone[] | undefined {
  return normalizeMilestonesForSave(milestones);
}

function normalizeItemTree(items: RoadmapItem[]): RoadmapItem[] {
  return items.map(item => {
    const normalizedType = normalizeItemType(item.type);
    const {
      workType: legacyWorkType,
      assignedTeams,
      teamStatuses,
      ...itemWithoutLegacyWorkType
    } = item as RoadmapItem & {
      workType?: string;
      assignedTeams?: unknown;
      teamStatuses?: unknown;
    };
    void assignedTeams;
    void teamStatuses;
    const normalizedImages = normalizeItemImages(item);
    return {
      ...itemWithoutLegacyWorkType,
      type: normalizedType,
      groupItemType: normalizedType === 'group'
        ? normalizeGroupItemType(item.groupItemType ?? legacyWorkType)
        : undefined,
      images: normalizedImages,
      ...toLegacyImageFields(normalizedImages),
      priority: normalizeItemPriority(item.priority),
      phaseIds: normalizePhaseIds(item.phaseIds),
      children: item.children ? normalizeItemTree(item.children) : item.children,
    };
  });
}

function buildPhaseApplyConfirmMessage(groups: PhaseDateAffectedGroup[]): string {
  const header = `Sẽ cập nhật date cho ${groups.length} group. Tiếp tục?`;
  if (groups.length === 0) return header;
  const lines = groups.map((group, index) => `${index + 1}. ${group.path}`);
  return `${header}\n\n${lines.join('\n')}`;
}

function buildPhaseApplySummaryMessage(result: ApplyPhaseDatesResult): string {
  const base = `Đã cập nhật date cho ${result.updatedCount} group.`;
  if (result.skippedUnscheduledCount > 0) {
    return `${base} Bỏ qua ${result.skippedUnscheduledCount} group do week chưa có lịch.`;
  }
  return base;
}

function getDefaultViewSettings(): RoadmapViewSettings {
  return {
    beforeMonths: 2,
    afterMonths: 2,
    filterCategory: [],
    filterStatus: [],
    filterTeam: [],
    filterPriority: [],
    filterPhase: [],
    filterSubcategory: [],
    filterGroupItemType: [],
    colWorkType: false,
    colPriority: false,
    colVersion: false,
    colPhase: false,
    colStartDate: true,
    colEndDate: true,
    colFeaturesWidth: DEFAULT_FEATURES_COL_WIDTH,
    colFeaturesWidthMode: 'auto',
    timelineMode: DEFAULT_TIMELINE_MODE,
    timelineOnly: false,
    timelineTaskWidth: DEFAULT_TIMELINE_TASK_WIDTH,
    reportedMode: false,
    expandedIds: [],
    hiddenRowIds: [],
  };
}


export default function RoadmapPage() {
  const params = useParams();
  const router = useRouter();
  const roadmapId = typeof params?.id === 'string' ? params.id : '';

  const [data, setData] = useState<RoadmapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveTick, setSaveTick] = useState(0);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [isReportsPanelOpen, setIsReportsPanelOpen] = useState(false);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [isApplyingPhaseDates, setIsApplyingPhaseDates] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [hasUnsavedSharedChanges, setHasUnsavedSharedChanges] = useState(false);
  const [hasPendingReleaseMetaPatch, setHasPendingReleaseMetaPatch] = useState(false);
  const [storageMode, setStorageMode] = useState<'json' | 'table' | null>(null);
  const [reportedSourceData, setReportedSourceData] = useState<RoadmapDocument | null>(null);
  const [reportedSourceLoading, setReportedSourceLoading] = useState(false);
  const [reportedSourceError, setReportedSourceError] = useState<string | null>(null);
  const currentVersionRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const latestLoadedSettingsRef = useRef<Partial<RoadmapViewSettings> | null>(null);
  const hasHydratedViewSettingsRef = useRef(false);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  // Per-roadmap config (team roles, statuses) — fallback to defaults for JSON-mode or unconfigured roadmaps
  const roadmapConfig: RoadmapConfig = useMemo(() => data?.config ?? DEFAULT_ROADMAP_CONFIG, [data?.config]);

  const [beforeMonths, setBeforeMonths] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterPhase, setFilterPhase] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterGroupItemType, setFilterGroupItemType] = useState<string[]>([]);
  const [isReportedMode, setIsReportedMode] = useState(false);

  // Quick filter v2 state (mutual exclusion: only one mode active at a time)
  const [quickFilterMode, setQuickFilterMode] = useState<QuickFilterMode>(null);
  const [qfStatus, setQfStatus] = useState<QuickFilterStatusState>(EMPTY_QUICK_FILTER_STATUS);
  const [qfTeam, setQfTeam] = useState<QuickFilterTeamState>(EMPTY_QUICK_FILTER_TEAM);
  const [qfPriority, setQfPriority] = useState<QuickFilterPriorityState>(EMPTY_QUICK_FILTER_PRIORITY);

  const [showWorkType, setShowWorkType] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [showPhase, setShowPhase] = useState(false);
  const [showStartDate, setShowStartDate] = useState(true);
  const [showEndDate, setShowEndDate] = useState(true);
  const [featuresColWidth, setFeaturesColWidth] = useState(DEFAULT_FEATURES_COL_WIDTH);
  const [featuresColWidthMode, setFeaturesColWidthMode] = useState<ColumnWidthMode>('auto');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(DEFAULT_TIMELINE_MODE);
  const [timelineOnly, setTimelineOnly] = useState(false);
  const [timelineTaskWidth, setTimelineTaskWidth] = useState(DEFAULT_TIMELINE_TASK_WIDTH);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
  const hasInitializedExpansion = useRef(false);

  const { toasts, addToast, removeToast } = useToast();
  const {
    user: authUser,
    accessToken,
    loading: googleAuthLoading,
    error: googleAuthError,
    clearError: clearGoogleAuthError,
    loginWithGoogle,
    logout: logoutGoogle,
  } = useGoogleAuth();
  const documentPermission = useMemo<EditPermission>(() => getDocumentPermission(authUser), [authUser]);
  const canManageRoadmap = documentPermission.canManageRoadmap;
  const reportedSourceRoadmapId = useMemo(
    () => resolveReportedSourceRoadmapId(roadmapId),
    [roadmapId]
  );
  const isReportedBridgeActive = isReportedMode && reportedSourceRoadmapId !== roadmapId;
  const viewSettingsScope = useMemo(() => {
    if (authUser?.email) return authUser.email.trim().toLowerCase();
    if (guestMode) return 'guest';
    return null;
  }, [authUser?.email, guestMode]);
  const viewSettingsStorageKey = useMemo(
    () => (roadmapId && viewSettingsScope ? buildViewSettingsStorageKey(roadmapId, viewSettingsScope) : null),
    [roadmapId, viewSettingsScope]
  );
  const ensureCanManageRoadmap = useCallback(() => {
    if (canManageRoadmap) return true;
    addToast('Tài khoản hiện tại không có quyền chỉnh sửa cấu trúc roadmap.', 'error');
    return false;
  }, [addToast, canManageRoadmap]);

  const readStoredViewSettings = useCallback((): Partial<RoadmapViewSettings> | null => {
    if (!viewSettingsStorageKey) return null;
    try {
      return parseStoredViewSettings(window.localStorage.getItem(viewSettingsStorageKey));
    } catch {
      return null;
    }
  }, [viewSettingsStorageKey]);

  const buildCurrentViewSettings = useCallback((): RoadmapViewSettings => ({
    beforeMonths,
    afterMonths,
    filterCategory,
    filterStatus: normalizeStatusFilter(filterStatus),
    filterTeam,
    filterPriority: normalizePriorityFilterValues(filterPriority),
    filterPhase: normalizePhaseFilterValues(filterPhase),
    filterSubcategory,
    filterGroupItemType: normalizeGroupItemTypeFilter(filterGroupItemType),
    reportedMode: isReportedMode,
    colWorkType: showWorkType,
    colPriority: showPriority,
    colVersion: showVersion,
    colPhase: showPhase,
    colStartDate: showStartDate,
    colEndDate: showEndDate,
    colFeaturesWidth: clampFeaturesColWidth(featuresColWidth),
    colFeaturesWidthMode: featuresColWidthMode,
    timelineMode,
    timelineOnly,
    timelineTaskWidth: clampTimelineTaskWidth(timelineTaskWidth),
    expandedIds: Array.from(expandedIds),
    hiddenRowIds: Array.from(hiddenRowIds),
  }), [
    beforeMonths, afterMonths, filterCategory, filterStatus, filterTeam,
    filterPriority, filterPhase, filterSubcategory, filterGroupItemType,
    isReportedMode, showWorkType, showPriority, showVersion, showPhase, showStartDate,
    showEndDate, featuresColWidth, featuresColWidthMode, timelineMode, timelineOnly,
    timelineTaskWidth, expandedIds, hiddenRowIds,
  ]);

  const persistCurrentViewSettings = useCallback((settings?: RoadmapViewSettings) => {
    if (!viewSettingsStorageKey) return;
    try {
      window.localStorage.setItem(viewSettingsStorageKey, JSON.stringify(settings ?? buildCurrentViewSettings()));
    } catch {
      // Ignore storage errors; view persistence is best-effort only.
    }
  }, [buildCurrentViewSettings, viewSettingsStorageKey]);

  const applyViewSettings = useCallback((settings?: Partial<RoadmapViewSettings> | null) => {
    const defaults = getDefaultViewSettings();
    const next = { ...defaults, ...(settings || {}) };
    const normalizedPriority = normalizePriorityFilterValues(next.filterPriority);
    const shouldResetReportedMode = next.reportedMode === true;

    setBeforeMonths(typeof next.beforeMonths === 'number' ? next.beforeMonths : defaults.beforeMonths);
    setAfterMonths(typeof next.afterMonths === 'number' ? next.afterMonths : defaults.afterMonths);
    setFilterCategory(Array.isArray(next.filterCategory) ? next.filterCategory : defaults.filterCategory || []);
    setFilterStatus(normalizeStatusFilter(next.filterStatus));
    setFilterTeam(Array.isArray(next.filterTeam) ? next.filterTeam : defaults.filterTeam || []);
    setFilterPriority(shouldResetReportedMode ? removeReportedPriority(normalizedPriority) : normalizedPriority);
    setFilterPhase(normalizePhaseFilterValues(next.filterPhase));
    setFilterSubcategory(Array.isArray(next.filterSubcategory)
      ? stripQuickViewSubcategories(next.filterSubcategory)
      : defaults.filterSubcategory || []);
    setFilterGroupItemType(normalizeGroupItemTypeFilter(next.filterGroupItemType));
    setIsReportedMode(false);
    setShowWorkType(typeof next.colWorkType === 'boolean' ? next.colWorkType : defaults.colWorkType ?? false);
    setShowPriority(typeof next.colPriority === 'boolean' ? next.colPriority : defaults.colPriority ?? false);
    setShowVersion(typeof next.colVersion === 'boolean' ? next.colVersion : defaults.colVersion ?? false);
    setShowPhase(typeof next.colPhase === 'boolean' ? next.colPhase : defaults.colPhase ?? false);
    setShowStartDate(typeof next.colStartDate === 'boolean' ? next.colStartDate : defaults.colStartDate ?? true);
    setShowEndDate(typeof next.colEndDate === 'boolean' ? next.colEndDate : defaults.colEndDate ?? true);
    setFeaturesColWidth(clampFeaturesColWidth(
      typeof next.colFeaturesWidth === 'number'
        ? next.colFeaturesWidth
        : defaults.colFeaturesWidth ?? DEFAULT_FEATURES_COL_WIDTH
    ));
    if (next.colFeaturesWidthMode === 'auto' || next.colFeaturesWidthMode === 'manual') {
      setFeaturesColWidthMode(next.colFeaturesWidthMode);
    } else {
      setFeaturesColWidthMode(defaults.colFeaturesWidthMode ?? 'auto');
    }
    if (next.timelineMode === 'day' || next.timelineMode === 'week' || next.timelineMode === 'month') {
      setTimelineMode(next.timelineMode);
    } else {
      setTimelineMode(defaults.timelineMode ?? DEFAULT_TIMELINE_MODE);
    }
    setTimelineOnly(!!next.timelineOnly);
    setTimelineTaskWidth(clampTimelineTaskWidth(
      typeof next.timelineTaskWidth === 'number'
        ? next.timelineTaskWidth
        : defaults.timelineTaskWidth ?? DEFAULT_TIMELINE_TASK_WIDTH
    ));
    if (Array.isArray(next.expandedIds)) {
      setExpandedIds(new Set(next.expandedIds));
      hasInitializedExpansion.current = true;
    } else if (Array.isArray(defaults.expandedIds)) {
      setExpandedIds(new Set(defaults.expandedIds));
    }
    if (Array.isArray(next.hiddenRowIds)) {
      setHiddenRowIds(new Set(next.hiddenRowIds));
    } else if (Array.isArray(defaults.hiddenRowIds)) {
      setHiddenRowIds(new Set(defaults.hiddenRowIds));
    }
    hasHydratedViewSettingsRef.current = true;
  }, []);

  const buildSharedDocumentSnapshot = useCallback((baseData: RoadmapDocument): RoadmapDocument => {
    return stripViewSettingsFromDocument({
      ...baseData,
      milestones: normalizeMilestones(baseData.milestones),
      items: baseData.items,
    });
  }, []);

  const buildJsonBackupSnapshot = useCallback((baseData: RoadmapDocument): RoadmapDocument => ({
    ...buildSharedDocumentSnapshot(baseData),
    settings: buildCurrentViewSettings(),
  }), [buildCurrentViewSettings, buildSharedDocumentSnapshot]);

  const normalizeDocument = useCallback((doc: RoadmapDocument): RoadmapDocument => ({
    ...doc,
    milestones: normalizeMilestones(doc.milestones),
    settings: doc.settings
      ? {
        ...doc.settings,
        filterPriority: normalizePriorityFilterValues(doc.settings.filterPriority),
        filterPhase: normalizePhaseFilterValues(doc.settings.filterPhase),
        filterGroupItemType: normalizeGroupItemTypeFilter(doc.settings.filterGroupItemType),
      }
      : doc.settings,
    items: recalculateRoadmap(normalizeItemTree(normalizeRoadmapItemTimestamps(doc.items || []))),
  }), []);

  const fetchRoadmapVersion = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/version`, { cache: 'no-store' });
      if (!res.ok) return null;
      const payload = await res.json().catch(() => ({}));
      if (payload?.storageMode === 'json' || payload?.storageMode === 'table') {
        setStorageMode(payload.storageMode);
      }
      return typeof payload?.updatedAt === 'string' ? payload.updatedAt : null;
    } catch {
      return null;
    }
  }, [roadmapId]);

  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        message,
        onConfirm: () => { setConfirmState(null); resolve(true); },
      });
    });
  }, []);

  const today = useMemo(() => startOfDay(new Date()), []);

  const viewStart = useMemo(() => {
    if (beforeMonths < 1) {
      // Fractional months → use weeks (0.5 = 2 weeks)
      const s = subWeeks(today, Math.round(beforeMonths * 4));
      return format(s, 'yyyy-MM-dd');
    }
    const s = startOfMonth(subMonths(today, beforeMonths));
    return format(s, 'yyyy-MM-dd');
  }, [today, beforeMonths]);

  const viewEnd = useMemo(() => {
    const e = endOfMonth(addMonths(today, afterMonths));
    return format(e, 'yyyy-MM-dd');
  }, [today, afterMonths]);

  const hydrateRoadmap = useCallback((json: RoadmapDocument, version: string | null) => {
    const normalized = normalizeDocument(json);
    const rawLegacy = normalized.settings ? { ...normalized.settings } : null;
    // Strip column visibility from legacy/document settings — these are per-user preferences only
    if (rawLegacy) {
      delete rawLegacy.colWorkType;
      delete rawLegacy.colPriority;
      delete rawLegacy.colVersion;
      delete rawLegacy.colPhase;
      delete rawLegacy.colStartDate;
      delete rawLegacy.colEndDate;
    }
    const legacySettings = rawLegacy;
    latestLoadedSettingsRef.current = legacySettings;
    setData(stripViewSettingsFromDocument(normalized));
    setHasUnsavedSharedChanges(false);
    setHasPendingReleaseMetaPatch(false);
    currentVersionRef.current = version;

    const storedSettings = readStoredViewSettings();
    applyViewSettings(storedSettings ?? legacySettings);

    if (!hasInitializedExpansion.current && normalized.items) {
      const ids = new Set<string>();
      const collect = (items: RoadmapItem[]) => {
        for (const item of items) {
          if (item.children?.length) { ids.add(item.id); collect(item.children); }
        }
      };
      collect(normalized.items);
      setExpandedIds(ids);
      hasInitializedExpansion.current = true;
    }
  }, [applyViewSettings, normalizeDocument, readStoredViewSettings]);

  const loadRoadmap = useCallback(async () => {
    if (!roadmapId) return false;

    try {
      const [roadmapRes, version] = await Promise.all([
        fetch(`/api/roadmap/${roadmapId}`, { cache: 'no-store' }),
        fetchRoadmapVersion(),
      ]);
      if (!roadmapRes.ok) throw new Error('roadmap fetch failed');

      const json = await roadmapRes.json();
      hydrateRoadmap(json, version);
      return true;
    } catch {
      addToast('Không thể tải dữ liệu roadmap.', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [addToast, fetchRoadmapVersion, hydrateRoadmap, roadmapId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!roadmapId) return;
      try {
        const [roadmapRes, version] = await Promise.all([
          fetch(`/api/roadmap/${roadmapId}`, { cache: 'no-store' }),
          fetchRoadmapVersion(),
        ]);
        if (!roadmapRes.ok) throw new Error('roadmap fetch failed');

        const json = await roadmapRes.json();
        if (cancelled) return;
        hydrateRoadmap(json, version);
      } catch {
        if (!cancelled) addToast('Không thể tải dữ liệu roadmap.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [roadmapId, addToast, hydrateRoadmap, fetchRoadmapVersion]);

  useEffect(() => {
    if (!roadmapId || !viewSettingsScope) return;

    const storedSettings = readStoredViewSettings();
    if (storedSettings) {
      applyViewSettings(storedSettings);
    } else if (latestLoadedSettingsRef.current) {
      applyViewSettings(latestLoadedSettingsRef.current);
    }
  }, [applyViewSettings, readStoredViewSettings, roadmapId, viewSettingsScope]);

  useEffect(() => {
    if (!viewSettingsScope || !hasHydratedViewSettingsRef.current) return;
    persistCurrentViewSettings();
  }, [persistCurrentViewSettings, viewSettingsScope]);

  useEffect(() => {
    if (!hasUnsavedSharedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasUnsavedSharedChanges]);

  useEffect(() => {
    if (!roadmapId || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(buildRoadmapChannelName(roadmapId));
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data as { type?: string; version?: string } | null;
      if (payload?.type !== 'roadmap-updated') return;
      const nextVersion = typeof payload.version === 'string' ? payload.version : null;
      if (!isVersionNewer(nextVersion, currentVersionRef.current)) return;
      void checkRemoteVersion();
    };

    return () => {
      channel.close();
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
    };
  }, [roadmapId]);

  // Debounced toast for admin when remote data changes
  const lastVersionToastRef = useRef<number>(0);
  const notifyVersionUpdate = useCallback(() => {
    if (!canManageRoadmap) return;
    const now = Date.now();
    if (now - lastVersionToastRef.current < 10_000) return;
    lastVersionToastRef.current = now;
    addToast('Dữ liệu vừa được cập nhật từ nguồn khác.', 'info', 5000);
  }, [canManageRoadmap, addToast]);

  const checkRemoteVersion = useCallback(async () => {
    const latestVersion = await fetchRoadmapVersion();
    if (!latestVersion) return;

    const currentVersion = currentVersionRef.current;
    if (!currentVersion) {
      currentVersionRef.current = latestVersion;
      return;
    }

    if (!isVersionNewer(latestVersion, currentVersion)) return;

    // Auto-reload silently when no unsaved changes and no save in flight
    if (!saveInFlightRef.current && !hasUnsavedSharedChanges) {
      notifyVersionUpdate();
      currentVersionRef.current = latestVersion;
      void loadRoadmap();
    }
  }, [fetchRoadmapVersion, hasUnsavedSharedChanges, loadRoadmap, notifyVersionUpdate]);

  useEffect(() => {
    if (!roadmapId || loading || (!authUser && !guestMode)) return;

    let isMounted = true;
    let realtimeChannel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null = null;

    try {
      const supabaseBrowser = getSupabaseBrowserClient();
      realtimeChannel = supabaseBrowser
        .channel(`roadmap-realtime:${roadmapId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'roadmap_data',
            filter: `id=eq.${roadmapId}`,
          },
          (payload: RealtimePostgresChangesPayload<{ updated_at?: string | null }>) => {
            if (!isMounted) return;

            const nextVersion = typeof payload.new === 'object' && payload.new && 'updated_at' in payload.new
              ? typeof payload.new.updated_at === 'string'
                ? payload.new.updated_at
                : null
              : null;

            if (!nextVersion || !isVersionNewer(nextVersion, currentVersionRef.current)) return;
            if (saveInFlightRef.current) return;
            void checkRemoteVersion();
          }
        )
        .subscribe((status: string) => {
          if (!isMounted) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void checkRemoteVersion();
          }
        });

      return () => {
        isMounted = false;
        if (realtimeChannel) {
          void realtimeChannel.unsubscribe();
          void supabaseBrowser.removeChannel(realtimeChannel);
        }
      };
    } catch {
      return;
    }
  }, [authUser, checkRemoteVersion, guestMode, loading, roadmapId]);

  useEffect(() => {
    if (loading) return;

    const poll = () => { void checkRemoteVersion(); };
    const intervalId = window.setInterval(poll, VERSION_POLL_INTERVAL_MS);

    const onFocus = () => { poll(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkRemoteVersion, loading]);

  const handleGoogleLogin = useCallback(async () => {
    try {
      await loginWithGoogle(window.location.pathname);
    } catch {
      addToast('Khong the dang nhap bang Google. Vui long thu lai.', 'error');
    }
  }, [addToast, loginWithGoogle]);

  const handleGuestView = useCallback(() => {
    clearGoogleAuthError();
    setGuestMode(true);
  }, [clearGoogleAuthError]);

  const handleGoogleLogout = useCallback(async () => {
    if (hasUnsavedSharedChanges) {
      const confirmed = await showConfirm('Đang có thay đổi local chưa lưu. Bạn có muốn đăng xuất?');
      if (!confirmed) return;
    }
    await logoutGoogle();
    setGuestMode(false);
  }, [hasUnsavedSharedChanges, logoutGoogle, showConfirm]);

  // Compute effective filters: quick filter overrides Status/Team/Priority when active
  const effectiveFilters = useMemo(() => {
      let effectiveStatus = filterStatus;
      let effectiveTeam = filterTeam;
      let effectivePriority = filterPriority;

      if (storageMode !== 'json' && quickFilterMode) {
          switch (quickFilterMode) {
              case 'status':
                  effectiveStatus = qfStatus.statuses;
                  effectiveTeam = [];
                  effectivePriority = [];
                  break;
              case 'team':
                  effectiveTeam = qfTeam.teams;
                  effectiveStatus = qfTeam.statuses;
                  effectivePriority = [];
                  break;
              case 'priority':
                  effectivePriority = qfPriority.priorities;
                  effectiveTeam = qfPriority.teams;
                  effectiveStatus = [];
                  break;
          }
      }

      return {
          category: filterCategory,
          status: effectiveStatus,
          team: effectiveTeam,
          priority: effectivePriority,
          phase: filterPhase,
          subcategory: filterSubcategory,
          groupItemType: filterGroupItemType,
      };
  }, [
      storageMode, quickFilterMode, qfStatus, qfTeam, qfPriority,
      filterCategory, filterStatus, filterTeam, filterPriority,
      filterPhase, filterSubcategory, filterGroupItemType,
  ]);

  const exportVisibleRows = useMemo(() => {
    if (!data) return [];
    return getVisibleFlattenedRows(data.items, effectiveFilters, expandedIds, hiddenRowIds);
  }, [data, effectiveFilters, expandedIds, hiddenRowIds]);

  const exportSummaryRows = useMemo(() => {
    if (!data) return [];
    const filteredItems = filterRoadmapTree(data.items, effectiveFilters);
    return flattenRoadmap(filteredItems);
  }, [data, effectiveFilters]);

  const exportVisibleColumns = useMemo<ExcelExportColumn[]>(() => {
    const cols: ExcelExportColumn[] = [
      { id: 'id', header: 'ID' },
      { id: 'name', header: 'Name' },
      { id: 'note', header: 'Note' },
    ];
    if (showWorkType) cols.push({ id: 'workType', header: 'WorkType' });
    if (showPriority) cols.push({ id: 'priority', header: 'Priority' });
    if (showVersion) cols.push({ id: 'version', header: 'Version' });
    cols.push({ id: 'status', header: 'Status' });
    if (showPhase) cols.push({ id: 'phase', header: 'Week' });
    if (showStartDate) cols.push({ id: 'startDate', header: 'Start Date' });
    if (showEndDate) cols.push({ id: 'endDate', header: 'End Date' });
    return cols;
  }, [showWorkType, showPriority, showVersion, showPhase, showStartDate, showEndDate]);

  const broadcastVersionUpdate = useCallback((version: string | null) => {
    if (!version || !syncChannelRef.current) return;
    syncChannelRef.current.postMessage({
      type: 'roadmap-updated',
      version,
    });
  }, []);

  const resolveBaseVersion = useCallback(async (): Promise<string | null> => {
    if (currentVersionRef.current) return currentVersionRef.current;
    return fetchRoadmapVersion();
  }, [fetchRoadmapVersion]);

  const handleSaveViewPreferences = useCallback(() => {
    persistCurrentViewSettings();
    addToast('Đã lưu view cá nhân trên trình duyệt này.', 'success');
  }, [addToast, persistCurrentViewSettings]);

  const handleSave = useCallback(async (
    currentData: RoadmapDocument,
    options?: { forceFullSave?: boolean }
  ) => {
    if (!ensureCanManageRoadmap()) return;
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu roadmap.', 'error');
      return;
    }

    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }

    setSaving(true);
    saveInFlightRef.current = true;
    setSaveState('idle');
    const savingToastId = addToast('Đang lưu...', 'info', 0);
    try {
      if (hasPendingReleaseMetaPatch && !options?.forceFullSave) {
        const res = await fetch(`/api/roadmap/${roadmapId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            kind: 'release-meta',
            releaseName: currentData.releaseName,
            baseVersion,
          } satisfies RoadmapAdminPatchRequest),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          addToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
          setSaveState('error');
          setSaveTick(prev => prev + 1);
          return;
        }
        if (res.status === 403) {
          addToast('Tài khoản hiện tại không có quyền full-save roadmap.', 'error');
          setSaveState('error');
          setSaveTick(prev => prev + 1);
          return;
        }
        if (!res.ok) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Lỗi khi lưu tên roadmap');
        }

        if (payload?.document) {
          hydrateRoadmap(payload.document as RoadmapDocument, typeof payload?.updatedAt === 'string' ? payload.updatedAt : null);
        } else {
          await loadRoadmap();
        }

        const latestVersion = typeof payload?.updatedAt === 'string'
          ? payload.updatedAt
          : await fetchRoadmapVersion();
        if (latestVersion) {
          currentVersionRef.current = latestVersion;
          broadcastVersionUpdate(latestVersion);
        }
        setHasUnsavedSharedChanges(false);
        setHasPendingReleaseMetaPatch(false);
        addToast('Đã lưu thành công.', 'success');
        setSaveState('success');
        setSaveTick(prev => prev + 1);
        return;
      }

      const dataToSave = buildSharedDocumentSnapshot(currentData);

      const res = await fetch(`/api/roadmap/${roadmapId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          document: dataToSave,
          baseVersion,
        } satisfies RoadmapSaveRequest),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401) {
        addToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        return;
      }
      if (res.status === 403) {
        addToast('Tài khoản hiện tại không có quyền full-save roadmap.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        return;
      }
      // 409 = optimistic locking conflict (someone else edited between our load
      // and our save). Discard local edits and force-reload to latest server state.
      if (res.status === 409) {
        const serverVersion = typeof payload?.serverVersion === 'string' ? payload.serverVersion : null;
        if (serverVersion) {
          currentVersionRef.current = serverVersion;
          broadcastVersionUpdate(serverVersion);
        }
        addToast(
          typeof payload?.message === 'string'
            ? payload.message
            : 'Roadmap đã được cập nhật bởi người khác. Đang tải lại bản mới nhất.',
          'error',
          5000,
        );
        setHasUnsavedSharedChanges(false);
        setHasPendingReleaseMetaPatch(false);
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
        return;
      }
      if (!res.ok) throw new Error();
      const latestVersion = typeof payload?.updatedAt === 'string'
        ? payload.updatedAt
        : await fetchRoadmapVersion();
      if (latestVersion) {
        currentVersionRef.current = latestVersion;
        broadcastVersionUpdate(latestVersion);
      }
      setHasUnsavedSharedChanges(false);
      setHasPendingReleaseMetaPatch(false);
      addToast('Đã lưu thành công.', 'success');
      setSaveState('success');
      setSaveTick(prev => prev + 1);
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
    } finally {
      removeToast(savingToastId);
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    accessToken,
    addToast,
    authUser,
    broadcastVersionUpdate,
    buildSharedDocumentSnapshot,
    ensureCanManageRoadmap,
    fetchRoadmapVersion,
    removeToast,
    resolveBaseVersion,
    roadmapId,
    hasPendingReleaseMetaPatch,
    hydrateRoadmap,
    loadRoadmap,
  ]);

  const handleManagerFieldChanges = useCallback(async (changes: ManagerFieldChange[], optimisticData: RoadmapDocument) => {
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu thay đổi.', 'error');
      return;
    }

    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }

    const normalizedOptimistic = normalizeDocument(optimisticData);
    setData(stripViewSettingsFromDocument(normalizedOptimistic));
    setHasUnsavedSharedChanges(true);
    setSaving(true);
    saveInFlightRef.current = true;
    setSaveState('idle');

    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/manager-save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          changes,
          baseVersion,
        } satisfies RoadmapManagerSaveRequest),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const violations = Array.isArray(payload?.violations) ? payload.violations.join('\n') : '';
        throw new Error(violations || payload?.error || 'Không thể lưu thay đổi');
      }

      if (payload?.document) {
        hydrateRoadmap(payload.document as RoadmapDocument, typeof payload?.updatedAt === 'string' ? payload.updatedAt : null);
      } else {
        await loadRoadmap();
      }

      if (typeof payload?.updatedAt === 'string') {
        currentVersionRef.current = payload.updatedAt;
        broadcastVersionUpdate(payload.updatedAt);
      }

      setHasUnsavedSharedChanges(false);
      addToast('Đã lưu thành công.', 'success');
      setSaveState('success');
      setSaveTick(prev => prev + 1);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Lỗi khi lưu thay đổi manager.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
      await loadRoadmap();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    accessToken,
    addToast,
    authUser,
    broadcastVersionUpdate,
    hydrateRoadmap,
    loadRoadmap,
    normalizeDocument,
    resolveBaseVersion,
    roadmapId,
  ]);

  /**
   * Admin row-level field patch. Sends one or more {itemId, field, value}
   * changes to POST /admin-patch instead of shipping the whole document.
   *
   * Rollback on error: we apply the optimistic update via setData() before
   * the fetch. On any failure (network, 5xx, permission, version conflict)
   * we fall back to loadRoadmap() to replace local state with the server's
   * authoritative copy — otherwise the UI would show a value that never
   * persisted ("silent data loss").
   */
  const handleAdminFieldChanges = useCallback(async (
    changes: AdminItemFieldChange[],
    optimisticData: RoadmapDocument,
  ) => {
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu thay đổi.', 'error');
      return;
    }
    if (changes.length === 0) return;

    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }

    const normalizedOptimistic = normalizeDocument(optimisticData);
    setData(stripViewSettingsFromDocument(normalizedOptimistic));
    setHasUnsavedSharedChanges(true);
    setSaving(true);
    saveInFlightRef.current = true;
    setSaveState('idle');

    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/admin-patch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: 'fields',
          changes,
          baseVersion,
        } satisfies RoadmapAdminItemPatchRequest),
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        addToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
        return;
      }

      // 409 = baseVersion stale. Reload authoritative state and surface a message.
      if (res.status === 409) {
        const serverVersion = typeof payload?.serverVersion === 'string' ? payload.serverVersion : null;
        if (serverVersion) {
          currentVersionRef.current = serverVersion;
          broadcastVersionUpdate(serverVersion);
        }
        addToast(
          typeof payload?.message === 'string'
            ? payload.message
            : 'Roadmap đã được cập nhật bởi người khác. Đang tải lại bản mới nhất.',
          'error',
          5000,
        );
        setHasUnsavedSharedChanges(false);
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
        return;
      }

      if (!res.ok) {
        const violations = Array.isArray(payload?.violations) ? payload.violations.join('\n') : '';
        throw new Error(violations || payload?.error || 'Không thể lưu thay đổi');
      }

      if (typeof payload?.updatedAt === 'string') {
        currentVersionRef.current = payload.updatedAt;
        broadcastVersionUpdate(payload.updatedAt);
      }

      setHasUnsavedSharedChanges(false);
      addToast('Đã lưu thành công.', 'success');
      setSaveState('success');
      setSaveTick(prev => prev + 1);

      if (Array.isArray(payload?.warnings) && payload.warnings.length > 0) {
        // Some changes applied, others rejected — reload so UI matches server.
        await loadRoadmap();
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Lỗi khi lưu thay đổi.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
      // Rollback: replace optimistic state with the server's current state.
      await loadRoadmap();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    accessToken,
    addToast,
    authUser,
    broadcastVersionUpdate,
    loadRoadmap,
    normalizeDocument,
    resolveBaseVersion,
    roadmapId,
  ]);

  /**
   * Shared helper: runs a row-level admin structure patch (add/delete/move).
   * Handles optimistic UI, CAS via baseVersion, 401/409 handling, and rollback
   * on any failure. Keeps the three structure handlers tiny.
   */
  const runAdminStructurePatch = useCallback(async (
    payload: RoadmapAdminItemPatchRequest,
    optimisticData: RoadmapDocument,
  ): Promise<boolean> => {
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu thay đổi.', 'error');
      return false;
    }

    const normalizedOptimistic = normalizeDocument(optimisticData);
    setData(stripViewSettingsFromDocument(normalizedOptimistic));
    setHasUnsavedSharedChanges(true);
    setSaving(true);
    saveInFlightRef.current = true;
    setSaveState('idle');

    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/admin-patch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 401) {
        addToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
        return false;
      }

      if (res.status === 409) {
        const serverVersion = typeof body?.serverVersion === 'string' ? body.serverVersion : null;
        if (serverVersion) {
          currentVersionRef.current = serverVersion;
          broadcastVersionUpdate(serverVersion);
        }
        addToast(
          typeof body?.message === 'string'
            ? body.message
            : 'Roadmap đã được cập nhật bởi người khác. Đang tải lại bản mới nhất.',
          'error',
          5000,
        );
        setHasUnsavedSharedChanges(false);
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
        return false;
      }

      if (!res.ok) {
        throw new Error(body?.message || body?.error || 'Không thể lưu thay đổi');
      }

      if (typeof body?.updatedAt === 'string') {
        currentVersionRef.current = body.updatedAt;
        broadcastVersionUpdate(body.updatedAt);
      }

      setHasUnsavedSharedChanges(false);
      addToast('Đã lưu thành công.', 'success');
      setSaveState('success');
      setSaveTick(prev => prev + 1);
      // Reload to reconcile depth/sort_order with server truth.
      await loadRoadmap();
      return true;
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Lỗi khi lưu thay đổi.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
      await loadRoadmap();
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    accessToken,
    addToast,
    authUser,
    broadcastVersionUpdate,
    loadRoadmap,
    normalizeDocument,
    roadmapId,
  ]);

  const handleAdminAddItem = useCallback(async (
    parentItemId: string | null,
    insertIndex: number,
    item: RoadmapItem,
    optimisticData: RoadmapDocument,
  ) => {
    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }
    await runAdminStructurePatch({
      kind: 'add-item',
      parentItemId,
      insertIndex,
      item,
      baseVersion,
    }, optimisticData);
  }, [addToast, resolveBaseVersion, runAdminStructurePatch]);

  const handleAdminDeleteItem = useCallback(async (
    itemId: string,
    optimisticData: RoadmapDocument,
  ) => {
    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }
    await runAdminStructurePatch({
      kind: 'delete-item',
      itemId,
      baseVersion,
    }, optimisticData);
  }, [addToast, resolveBaseVersion, runAdminStructurePatch]);

  const handleAdminMoveItem = useCallback(async (
    itemId: string,
    newParentItemId: string | null,
    newIndex: number,
    optimisticData: RoadmapDocument,
  ) => {
    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }
    await runAdminStructurePatch({
      kind: 'move-item',
      itemId,
      newParentItemId,
      newIndex,
      baseVersion,
    }, optimisticData);
  }, [addToast, resolveBaseVersion, runAdminStructurePatch]);

  const handleAdminConvertType = useCallback(async (
    itemId: string,
    newType: 'subcategory' | 'group',
    newParentItemId: string | null,
    newIndex: number,
    optimisticData: RoadmapDocument,
  ) => {
    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }
    await runAdminStructurePatch({
      kind: 'convert-item-type',
      itemId,
      newType,
      newParentItemId,
      newIndex,
      baseVersion,
    }, optimisticData);
  }, [addToast, resolveBaseVersion, runAdminStructurePatch]);

  const handleExportExcelCurrentView = () => {
    if (!data) return;
    try {
      const built = buildRoadmapExcelFile(data, {
        mode: 'current-view',
        rows: exportVisibleRows,
        summaryRows: exportSummaryRows,
        columns: exportVisibleColumns,
        includeSummary: true,
      });
      downloadExcelFile(built.excelBuffer, built.fileName);
      addToast(`Exported ${built.fileName}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to export Excel (Current View).', 'error');
    }
  };

  const handleExportExcelFullData = () => {
    if (!data) return;
    try {
      const built = buildRoadmapExcelFile(data, { mode: 'full-data', includeSummary: false });
      downloadExcelFile(built.excelBuffer, built.fileName);
      addToast(`Exported ${built.fileName}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to export Excel (Full Data).', 'error');
    }
  };

  const handleNameChange = (name: string) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    setData({ ...data, releaseName: name });
    setHasUnsavedSharedChanges(true);
    setHasPendingReleaseMetaPatch(true);
  };

  const handleMilestonesSave = (milestones: Milestone[]) => {
    void (async () => {
      if (!ensureCanManageRoadmap()) return;
      if (!data || !authUser || !accessToken) {
        addToast('Bạn cần đăng nhập lại để lưu week.', 'error');
        return;
      }
      const baseVersion = await resolveBaseVersion();
      if (!baseVersion) {
        addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
        return;
      }

      const normalizedMilestones = normalizeMilestonesForSave(milestones) || [];
      const optimisticData = normalizeDocument({ ...data, milestones: normalizedMilestones });
      setData(stripViewSettingsFromDocument(optimisticData));
      setHasUnsavedSharedChanges(true);

      if (hasPendingReleaseMetaPatch) {
        setHasPendingReleaseMetaPatch(false);
        await handleSave(optimisticData, { forceFullSave: true });
        return;
      }

      setSaving(true);
      saveInFlightRef.current = true;
      setSaveState('idle');

      try {
        const res = await fetch(`/api/roadmap/${roadmapId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            kind: 'milestones',
            milestones: normalizedMilestones,
            baseVersion,
          } satisfies RoadmapAdminPatchRequest),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Không thể lưu week');
        }

        if (payload?.document) {
          hydrateRoadmap(payload.document as RoadmapDocument, typeof payload?.updatedAt === 'string' ? payload.updatedAt : null);
        } else {
          await loadRoadmap();
        }

        if (typeof payload?.updatedAt === 'string') {
          currentVersionRef.current = payload.updatedAt;
          broadcastVersionUpdate(payload.updatedAt);
        }

        setHasUnsavedSharedChanges(false);
        setHasPendingReleaseMetaPatch(false);
        addToast('Đã lưu thành công.', 'success');
        setSaveState('success');
        setSaveTick(prev => prev + 1);
      } catch (error) {
        addToast(error instanceof Error ? error.message : 'Lỗi khi lưu week.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        await loadRoadmap();
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    })();
  };

  const executePhaseDateApply = useCallback(async (result: ApplyPhaseDatesResult, emptyStateMessage: string) => {
    if (!data) return;

    if (result.affectedGroups.length === 0) {
      if (result.skippedUnscheduledCount > 0) {
        addToast(`Không có group nào được cập nhật. ${result.skippedUnscheduledCount} group đang gán week chưa có lịch.`, 'info');
      } else {
        addToast(emptyStateMessage, 'info');
      }
      return;
    }

    const confirmed = await showConfirm(buildPhaseApplyConfirmMessage(result.affectedGroups));
    if (!confirmed) return;

    setIsApplyingPhaseDates(true);
    try {
      const nextData = normalizeDocument({ ...data, items: result.items });
      setData(stripViewSettingsFromDocument(nextData));
      setHasUnsavedSharedChanges(true);
      setHasPendingReleaseMetaPatch(false);
      addToast(buildPhaseApplySummaryMessage(result), 'success');
      await handleSave(nextData);
    } finally {
      setIsApplyingPhaseDates(false);
    }
  }, [addToast, data, handleSave, normalizeDocument, showConfirm]);

  const handleApplyDatesByPhase = useCallback(async (phaseId: string, milestonesDraft: Milestone[]) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    const resolvedMilestones = normalizeMilestones(milestonesDraft) || [];
    const result = applyDatesByPhase(data.items, resolvedMilestones, phaseId);
    await executePhaseDateApply(result, 'Không có group nào cần cập nhật theo week này.');
  }, [data, ensureCanManageRoadmap, executePhaseDateApply]);

  const handleApplyDatesByAllPhases = useCallback(async (milestonesDraft: Milestone[]) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    const resolvedMilestones = normalizeMilestones(milestonesDraft) || [];
    const result = applyDatesByAllPhases(data.items, resolvedMilestones);
    await executePhaseDateApply(result, 'Không có group nào cần cập nhật theo các week hiện tại.');
  }, [data, ensureCanManageRoadmap, executePhaseDateApply]);

  const openFilterPopup = useCallback(() => { setShowFilterPopup(true); }, []);
  const openMilestonesPopup = useCallback(() => { setShowMilestones(true); }, []);

  const handleFilterChange = useCallback((type: 'category' | 'status' | 'team' | 'priority' | 'phase' | 'subcategory' | 'groupItemType', values: string[]) => {
    if (type === 'category') setFilterCategory(values);
    else if (type === 'status') setFilterStatus(values);
    else if (type === 'team') setFilterTeam(values);
    else if (type === 'priority') setFilterPriority(normalizePriorityFilterValues(values));
    else if (type === 'phase') setFilterPhase(normalizePhaseFilterValues(values));
    else if (type === 'subcategory') setFilterSubcategory(values);
    else if (type === 'groupItemType') setFilterGroupItemType(normalizeGroupItemTypeFilter(values));
  }, []);

  const handleQfStatusChange = useCallback((next: QuickFilterStatusState) => {
      setQfStatus(next);
      setQuickFilterMode(next.statuses.length > 0 ? 'status' : null);
  }, []);

  const handleQfTeamChange = useCallback((next: QuickFilterTeamState) => {
      setQfTeam(next);
      if (next.teams.length > 0 || next.statuses.length > 0) {
          setQuickFilterMode('team');
      } else {
          setQuickFilterMode(null);
      }
  }, []);

  const handleQfPriorityChange = useCallback((next: QuickFilterPriorityState) => {
      setQfPriority(next);
      if (next.priorities.length > 0 || next.teams.length > 0) {
          setQuickFilterMode('priority');
      } else {
          setQuickFilterMode(null);
      }
  }, []);

  const quickFilterState = useMemo<QuickFilterState>(() => ({
      activeMode: quickFilterMode,
      status: qfStatus,
      team: qfTeam,
      priority: qfPriority,
  }), [quickFilterMode, qfStatus, qfTeam, qfPriority]);

  const handleToggleQuickViewMode = useCallback((mode: QuickViewMode) => {
    if (mode === 'reported') {
      setIsReportedMode(prev => {
        const next = !prev;
        if (next) {
          setFilterPriority(current => ensureReportedPriority(current));
        } else {
          setFilterPriority(current => removeReportedPriority(current));
        }
        return next;
      });
      return;
    }

    setFilterSubcategory(prev => {
      const next = new Set(prev);
      const target = mode === 'web' ? 'Web' : 'App';
      const other = mode === 'web' ? 'App' : 'Web';
      const isActive = next.has(target) && next.has('Core');
      const otherActive = next.has(other) && next.has('Core');

      if (isActive) {
        next.delete(target);
        if (!otherActive) next.delete('Core');
      } else {
        next.add(target);
        next.add('Core');
      }

      return Array.from(next);
    });
  }, []);

  const handleExitReportedMode = useCallback(() => {
    setIsReportedMode(false);
    setFilterPriority(prev => removeReportedPriority(prev));
  }, []);

  const handleExpandOneLevel = useCallback(() => {
      if (!data) return;
      setExpandedIds(prev => {
          // Build depth map and collect all expandable ids (nodes with children)
          const depthMap = new Map<string, number>();
          const expandableIds = new Set<string>();
          const walk = (items: RoadmapItem[], depth: number) => {
              for (const item of items) {
                  depthMap.set(item.id, depth);
                  if (item.children?.length) {
                      expandableIds.add(item.id);
                      walk(item.children, depth + 1);
                  }
              }
          };
          walk(data.items, 0);

          // If nothing is expanded yet, expand depth 0
          if (prev.size === 0) {
              const next = new Set<string>();
              for (const id of expandableIds) {
                  if (depthMap.get(id) === 0) next.add(id);
              }
              return next;
          }

          // Find the min depth among expandable ids that are NOT yet expanded
          let minUnexpandedDepth = Infinity;
          for (const id of expandableIds) {
              if (!prev.has(id)) {
                  const d = depthMap.get(id)!;
                  if (d < minUnexpandedDepth) minUnexpandedDepth = d;
              }
          }

          // All expandable nodes already expanded
          if (minUnexpandedDepth === Infinity) return prev;

          // Add all expandable ids at that depth
          const next = new Set(prev);
          for (const id of expandableIds) {
              if (!prev.has(id) && depthMap.get(id) === minUnexpandedDepth) {
                  next.add(id);
              }
          }
          return next;
      });
  }, [data]);

  const handleCollapseOneLevel = useCallback(() => {
      if (!data) return;
      setExpandedIds(prev => {
          if (prev.size === 0) return prev;
          // Find the deepest expanded level and collapse it
          // Build depth map: id → depth
          const depthMap = new Map<string, number>();
          const walk = (items: RoadmapItem[], depth: number) => {
              for (const item of items) {
                  depthMap.set(item.id, depth);
                  if (item.children?.length) walk(item.children, depth + 1);
              }
          };
          walk(data.items, 0);

          // Find the max depth among currently expanded ids
          let maxDepth = -1;
          for (const id of prev) {
              const d = depthMap.get(id);
              if (d !== undefined && d > maxDepth) maxDepth = d;
          }
          if (maxDepth < 0) return new Set<string>();

          // Remove all expanded ids at maxDepth
          const next = new Set<string>();
          for (const id of prev) {
              const d = depthMap.get(id);
              if (d !== undefined && d < maxDepth) next.add(id);
          }
          return next;
      });
  }, [data]);

  useEffect(() => {
    if (!isReportedMode) return;
    setFilterPriority(prev => ensureReportedPriority(prev));
  }, [isReportedMode]);

  useEffect(() => {
    if (!activeReportId) { setActiveReport(null); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/reports/${activeReportId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { report: Report };
      if (!cancelled) setActiveReport(data.report);
    })();
    return () => { cancelled = true; };
  }, [activeReportId]);

  useEffect(() => {
    if (!isReportedBridgeActive) {
      setReportedSourceLoading(false);
      setReportedSourceError(null);
      setReportedSourceData(null);
      return;
    }

    let cancelled = false;

    const loadReportedSource = async () => {
      setReportedSourceLoading(true);
      setReportedSourceError(null);

      try {
        const res = await fetch(`/api/roadmap/${reportedSourceRoadmapId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('reported source fetch failed');

        const json = await res.json();
        if (cancelled) return;

        const normalized = normalizeDocument(json as RoadmapDocument);
        setReportedSourceData(stripViewSettingsFromDocument(normalized));
      } catch {
        if (!cancelled) {
          setReportedSourceData(null);
          setReportedSourceError('Không thể tải dữ liệu reported từ roadmap main.');
        }
      } finally {
        if (!cancelled) setReportedSourceLoading(false);
      }
    };

    void loadReportedSource();

    return () => {
      cancelled = true;
    };
  }, [isReportedBridgeActive, normalizeDocument, reportedSourceRoadmapId]);

  const handleDataChange = (newData: RoadmapDocument, shouldSave?: boolean) => {
    if (!canManageRoadmap) return;
    const normalized = normalizeDocument(newData);
    setData(stripViewSettingsFromDocument(normalized));
    setHasUnsavedSharedChanges(true);
    setHasPendingReleaseMetaPatch(false);
    if (shouldSave) {
      handleSave(normalized);
    }
  };

  const handleRootAdd = (newItem: RoadmapItem) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    const insertIndex = data.items.length;
    const normalized = normalizeDocument({ ...data, items: [...data.items, newItem] });
    // Prefer row-level admin insert (no full-doc clobber); fall back to full save
    // when admin handler isn't available (e.g., legacy JSON-mode roadmaps).
    if (storageMode === 'table') {
      // runAdminStructurePatch handles setData + unsaved flag + saving UI.
      // Reset release-meta-patch flag so subsequent saves don't try to use a
      // stale patch payload tied to a prior document version.
      setHasPendingReleaseMetaPatch(false);
      void handleAdminAddItem(null, insertIndex, newItem, normalized);
      return;
    }
    setData(stripViewSettingsFromDocument(normalized));
    setHasUnsavedSharedChanges(true);
    setHasPendingReleaseMetaPatch(false);
    handleSave(normalized);
  };

  const handleLoadJson = useCallback(async (jsonData: unknown) => {
    if (!ensureCanManageRoadmap()) return;
    const parsed = jsonData as Partial<RoadmapDocument> | null;
    if (!parsed || !Array.isArray(parsed.items)) {
      addToast('File JSON không hợp lệ, thiếu `items`', 'error');
      return;
    }
    const yes = await showConfirm('Bạn có chắc chắn muốn ĐÈ BẢN LƯU bằng file JSON vừa tải lên không?');
    if (!yes) return;

    const normalized = normalizeDocument(parsed as RoadmapDocument);
    latestLoadedSettingsRef.current = normalized.settings ? { ...normalized.settings } : null;
    setData(stripViewSettingsFromDocument(normalized));
    setHasUnsavedSharedChanges(true);
    setHasPendingReleaseMetaPatch(false);
    applyViewSettings(normalized.settings);
    persistCurrentViewSettings(normalized.settings ? { ...getDefaultViewSettings(), ...normalized.settings } : getDefaultViewSettings());
    await handleSave(normalized);
  }, [applyViewSettings, ensureCanManageRoadmap, handleSave, normalizeDocument, persistCurrentViewSettings, showConfirm, addToast]);

  const handleDownloadJson = async () => {
    if (!data) return;
    try {
      const snapshot = buildJsonBackupSnapshot(data);
      const res = await fetch('/api/export/json-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          releaseName: snapshot.releaseName,
        }),
      });
      if (!res.ok) throw new Error(`JSON backup failed: ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'backup.json';
      const relativePath = typeof payload?.relativePath === 'string'
        ? payload.relativePath
        : `storage/json-backups/${fileName}`;
      addToast(`Đã lưu JSON backup vào ${relativePath}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi lưu JSON backup.', 'error');
    }
  };

  const availableTeams = useMemo(() => {
    if (!data) return [];
    const teams = new Set<string>();
    const findTeams = (items: RoadmapItem[]) => {
      items.forEach(item => {
        if (item.type === 'team' && item.teamRole) teams.add(item.teamRole);
        if (item.children) findTeams(item.children);
      });
    };
    findTeams(data.items);
    return Array.from(teams).sort();
  }, [data]);

  const availableSubcategories = useMemo(() => {
    if (!data) return [];
    const subcategories = new Set<string>();
    const findSubcategories = (items: RoadmapItem[]) => {
      items.forEach(item => {
        if (item.type === 'subcategory') subcategories.add(item.name);
        if (item.children) findSubcategories(item.children);
      });
    };
    findSubcategories(data.items);
    return Array.from(subcategories).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const availableCategories = useMemo(() => {
    if (!data) return [];
    const categories = new Set<string>();
    const findCategories = (items: RoadmapItem[]) => {
      items.forEach(item => {
        if (item.type === 'category') categories.add(item.name);
        if (item.children) findCategories(item.children);
      });
    };
    findCategories(data.items);
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const availablePhases: PhaseOption[] = useMemo(() => {
    if (!data?.milestones) return [];
    return data.milestones.map((milestone, index) => {
      const id = (milestone.id || '').trim() || `phase_${index + 1}`;
      const label = normalizeWeekLabel(milestone.label, index);
      const hasSchedule = !!(normalizeDateValue(milestone.startDate) && normalizeDateValue(milestone.endDate));
      const color = normalizeWeekColor(milestone.color, index);
      return { id, label, hasSchedule, color };
    });
  }, [data]);

  const handleBackToHome = useCallback(async () => {
    if (hasUnsavedSharedChanges) {
      const confirmed = await showConfirm('Đang có thay đổi local chưa lưu. Bạn có muốn quay về trang chủ?');
      if (!confirmed) return;
    }

    router.push('/');
  }, [hasUnsavedSharedChanges, router, showConfirm]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500 text-sm">
        Đang tải Roadmap...
      </div>
    );
  }

  if (!googleAuthLoading && !authUser && !guestMode) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <LoginForm
          onGoogleLogin={handleGoogleLogin}
          onGuestView={handleGuestView}
          error={googleAuthError}
        />
      </main>
    );
  }

  const isAuthenticated = !!authUser;

  const authTeamLabel = authUser?.role === 'admin'
    ? 'Admin'
    : authUser?.team
      ? `${authUser.team} Manager`
      : null;

  return (
    <main className="flex flex-col h-screen max-w-full overflow-hidden bg-white text-gray-900">
      <LocalBackupBanner />
      <Toast toasts={toasts} onRemove={removeToast} />

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {showMilestones && (
        <MilestoneEditor
          milestones={data.milestones || []}
          onSave={handleMilestonesSave}
          onApplyPhase={handleApplyDatesByPhase}
          onApplyAll={handleApplyDatesByAllPhases}
          isApplyingDates={isApplyingPhaseDates}
          onClose={() => setShowMilestones(false)}
        />
      )}

      {isReportsPanelOpen && (
        <ReportsPanel
          canEdit={canManageRoadmap}
          onSelect={setActiveReportId}
          onClose={() => setIsReportsPanelOpen(false)}
          onToast={(message, kind) => addToast(message, kind ?? 'success')}
        />
      )}
      {activeReport && (
        <ReportPopup
          report={activeReport}
          canEdit={canManageRoadmap}
          onClose={() => setActiveReportId(null)}
          onDownload={async () => {
            const res = await fetch(`/api/reports/${activeReport.id}/download`);
            if (!res.ok) return;
            const data = (await res.json()) as { url: string };
            window.open(data.url, '_blank');
          }}
        />
      )}

      {showFilterPopup && (
        <FilterPopup
        isOpen={showFilterPopup}
        onClose={() => setShowFilterPopup(false)}
          canEdit={true}
          availableCategories={availableCategories}
          availableTeams={availableTeams}
          availableSubcategories={availableSubcategories}
          filterCategory={filterCategory}
          filterStatus={filterStatus}
          filterTeam={filterTeam}
          filterPriority={filterPriority}
          availablePhases={availablePhases}
          filterPhase={filterPhase}
          filterSubcategory={filterSubcategory}
          filterGroupItemType={filterGroupItemType}
          onFilterChange={handleFilterChange}
          onSaveView={handleSaveViewPreferences}
          roadmapConfig={roadmapConfig}
        />
      )}

      <Toolbar
        documentName={data.releaseName}
        onNameChange={handleNameChange}
        onExportExcelCurrentView={handleExportExcelCurrentView}
        onExportExcelFullData={handleExportExcelFullData}
        onDownloadJson={handleDownloadJson}
        onOpenFilterPopup={openFilterPopup}
        onOpenMilestonesPopup={openMilestonesPopup}
        isFilterPopupOpen={showFilterPopup}
        isMilestonesPopupOpen={showMilestones}
        beforeMonths={beforeMonths}
        afterMonths={afterMonths}
        onBeforeMonthsChange={setBeforeMonths}
        onAfterMonthsChange={setAfterMonths}
        onLoadJson={handleLoadJson}
        canEdit={canManageRoadmap}
        isGoogleAuthenticated={isAuthenticated}
        googleAuthLoading={googleAuthLoading}
        authLabel={authUser?.label ?? null}
        authTeamLabel={authTeamLabel}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
        filterCategory={filterCategory}
        filterStatus={filterStatus}
        filterTeam={filterTeam}
        filterPriority={filterPriority}
        filterPhase={filterPhase}
        filterSubcategory={filterSubcategory}
        filterGroupItemType={filterGroupItemType}
        availablePhases={availablePhases}
        onPhaseFilterChange={(values) => setFilterPhase(normalizePhaseFilterValues(values))}
        onToggleQuickViewMode={handleToggleQuickViewMode}
        isReportedMode={isReportedMode}
        onExitReportedMode={handleExitReportedMode}
        isTimelineOnly={timelineOnly}
        onToggleTimelineOnly={() => setTimelineOnly(prev => !prev)}
        onBackToHome={() => { void handleBackToHome(); }}
        isJsonMode={storageMode === 'json'}
        quickFilter={quickFilterState}
        onQuickFilterStatusChange={handleQfStatusChange}
        onQuickFilterTeamChange={handleQfTeamChange}
        onQuickFilterPriorityChange={handleQfPriorityChange}
        onExpandAll={handleExpandOneLevel}
        onCollapseAll={handleCollapseOneLevel}
        roadmapConfig={roadmapConfig}
        onOpenReportsPanel={() => setIsReportsPanelOpen((prev) => !prev)}
        isReportsPanelOpen={isReportsPanelOpen}
      />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid
          key={canManageRoadmap ? 'admin-grid' : authUser ? 'manager-grid' : 'viewer-grid'}
          data={data}
          reportedData={reportedSourceData}
          reportedBridgeReadOnly={isReportedBridgeActive}
          reportedBridgeLoading={reportedSourceLoading}
          reportedBridgeError={reportedSourceError}
          reportedBridgeLabel={isReportedBridgeActive ? 'Reported' : null}
          onDataChange={handleDataChange}
          onRootAdd={handleRootAdd}
          showConfirm={showConfirm}
          viewStart={viewStart}
          viewEnd={viewEnd}
          timelineMode={timelineMode}
          timelineOnly={timelineOnly}
          timelineTaskW={timelineTaskWidth}
          setTimelineTaskW={setTimelineTaskWidth}
          filterCategory={effectiveFilters.category}
          filterStatus={effectiveFilters.status}
          filterTeam={effectiveFilters.team}
          filterPriority={effectiveFilters.priority}
          filterPhase={filterPhase}
          filterSubcategory={filterSubcategory}
          filterGroupItemType={filterGroupItemType}
          reportedMode={isReportedMode}
          isSaving={saving}
          saveState={saveState}
          saveTick={saveTick}
          currentUser={authUser}
          documentPermission={documentPermission}
          roadmapConfig={roadmapConfig}
          onManagerFieldChanges={handleManagerFieldChanges}
          onAdminFieldChanges={handleAdminFieldChanges}
          {...(storageMode === 'table' ? {
            onAdminAddItem: handleAdminAddItem,
            onAdminDeleteItem: handleAdminDeleteItem,
            onAdminMoveItem: handleAdminMoveItem,
            onAdminConvertType: handleAdminConvertType,
          } : {})}
          showWorkType={showWorkType} setShowWorkType={setShowWorkType}
          showPriority={showPriority} setShowPriority={setShowPriority}
          showVersion={showVersion} setShowVersion={setShowVersion}
          showPhase={showPhase} setShowPhase={setShowPhase}
          showStartDate={showStartDate} setShowStartDate={setShowStartDate}
          showEndDate={showEndDate} setShowEndDate={setShowEndDate}
          nameW={featuresColWidth}
          setNameW={setFeaturesColWidth}
          nameWMode={featuresColWidthMode}
          setNameWMode={setFeaturesColWidthMode}
          today={today}
          expandedIds={expandedIds} setExpandedIds={setExpandedIds}
          hiddenRowIds={hiddenRowIds} setHiddenRowIds={setHiddenRowIds}
          addToast={addToast}
        />
      </div>
      <TimelineModeFab mode={timelineMode} onModeChange={setTimelineMode} />
    </main>
  );
}
