'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Toolbar, { type QuickViewMode } from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import MilestoneEditor from '@/components/MilestoneEditor';
import FilterPopup from '@/components/FilterPopup';
import TimelineModeFab from '@/components/TimelineModeFab';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoginForm } from '@/components/LoginForm';
import { useToast } from '@/hooks/useToast';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import type { EditPermission, ManagerFieldChange } from '@/types/auth';
import {
  ColumnWidthMode,
  Milestone,
  PhaseOption,
  RoadmapDocument,
  RoadmapItem,
  RoadmapViewSettings,
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
import type { RoadmapAdminPatchRequest, RoadmapManagerSaveRequest, RoadmapSaveRequest } from '@/types/roadmapSave';
import { buildRoadmapExcelFile, type ExcelExportColumn } from '@/utils/exportToExcel';
import {
  VERSION_CONFLICT_CODE,
  buildConflictDraftStorageKey,
  buildRoadmapChannelName,
  isMatchingVersion,
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
} from '@/utils/reportedMode';
import {
  applyDatesByAllPhases,
  applyDatesByPhase,
  type ApplyPhaseDatesResult,
  type PhaseDateAffectedGroup,
} from '@/utils/phaseDateApply';
import { getDocumentPermission } from '@/utils/permissions';
import { buildViewSettingsStorageKey, parseStoredViewSettings, stripViewSettingsFromDocument } from '@/utils/roadmapViewSettings';

const DEFAULT_FEATURES_COL_WIDTH = 260;
const MIN_FEATURES_COL_WIDTH = 120;
const MAX_FEATURES_COL_WIDTH = 450;
const DEFAULT_TIMELINE_MODE: TimelineMode = 'day';
const DEFAULT_TIMELINE_TASK_WIDTH = 220;
const MIN_TIMELINE_TASK_WIDTH = 140;
const MAX_TIMELINE_TASK_WIDTH = 420;
const VERSION_POLL_INTERVAL_MS = 20_000;
const CONFLICT_DRAFT_FILE_PREFIX = 'roadmap-conflict-draft';

function clampFeaturesColWidth(width: number): number {
  return Math.max(MIN_FEATURES_COL_WIDTH, Math.min(MAX_FEATURES_COL_WIDTH, width));
}

function clampTimelineTaskWidth(width: number): number {
  return Math.max(MIN_TIMELINE_TASK_WIDTH, Math.min(MAX_TIMELINE_TASK_WIDTH, width));
}

function normalizeDateValue(value: string | undefined): string {
  return normalizeMilestoneDateValue(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
    beforeWeeks: 2,
    afterMonths: 2,
    filterCategory: [],
    filterStatus: [],
    filterTeam: [],
    filterPriority: [],
    filterPhase: [],
    filterSubcategory: [],
    filterGroupItemType: [],
    colWorkType: true,
    colPriority: true,
    colPhase: true,
    colStartDate: false,
    colEndDate: false,
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

function downloadJsonFile(fileName: string, content: unknown) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [isApplyingPhaseDates, setIsApplyingPhaseDates] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [hasUnsavedSharedChanges, setHasUnsavedSharedChanges] = useState(false);
  const [hasPendingReleaseMetaPatch, setHasPendingReleaseMetaPatch] = useState(false);
  const [pendingRemoteVersion, setPendingRemoteVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<{
    message: string;
    serverVersion: string | null;
  } | null>(null);
  const [hasStoredConflictDraft, setHasStoredConflictDraft] = useState(false);
  const currentVersionRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const latestLoadedSettingsRef = useRef<Partial<RoadmapViewSettings> | null>(null);
  const hasHydratedViewSettingsRef = useRef(false);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const [beforeWeeks, setBeforeWeeks] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterPhase, setFilterPhase] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterGroupItemType, setFilterGroupItemType] = useState<string[]>([]);
  const [isReportedMode, setIsReportedMode] = useState(false);

  const [showWorkType, setShowWorkType] = useState(true);
  const [showPriority, setShowPriority] = useState(true);
  const [showPhase, setShowPhase] = useState(true);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
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
  const viewSettingsScope = useMemo(() => {
    if (authUser?.email) return authUser.email.trim().toLowerCase();
    if (guestMode) return 'guest';
    return null;
  }, [authUser?.email, guestMode]);
  const viewSettingsStorageKey = useMemo(
    () => (roadmapId && viewSettingsScope ? buildViewSettingsStorageKey(roadmapId, viewSettingsScope) : null),
    [roadmapId, viewSettingsScope]
  );
  const conflictDraftStorageKey = useMemo(
    () => (roadmapId && viewSettingsScope ? buildConflictDraftStorageKey(roadmapId, viewSettingsScope) : null),
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
    beforeWeeks,
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
    beforeWeeks, afterMonths, filterCategory, filterStatus, filterTeam,
    filterPriority, filterPhase, filterSubcategory, filterGroupItemType,
    isReportedMode, showWorkType, showPriority, showPhase, showStartDate,
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

    setBeforeWeeks(typeof next.beforeWeeks === 'number' ? next.beforeWeeks : defaults.beforeWeeks);
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
    setShowWorkType(typeof next.colWorkType === 'boolean' ? next.colWorkType : defaults.colWorkType ?? true);
    setShowPriority(typeof next.colPriority === 'boolean' ? next.colPriority : defaults.colPriority ?? true);
    setShowPhase(typeof next.colPhase === 'boolean' ? next.colPhase : defaults.colPhase ?? true);
    setShowStartDate(typeof next.colStartDate === 'boolean' ? next.colStartDate : defaults.colStartDate ?? false);
    setShowEndDate(typeof next.colEndDate === 'boolean' ? next.colEndDate : defaults.colEndDate ?? false);
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

  const persistConflictDraft = useCallback((snapshot: RoadmapDocument) => {
    if (!conflictDraftStorageKey) return;
    try {
      window.sessionStorage.setItem(conflictDraftStorageKey, JSON.stringify({
        capturedAt: new Date().toISOString(),
        snapshot,
      }));
      setHasStoredConflictDraft(true);
    } catch {
      // Ignore session storage failures.
    }
  }, [conflictDraftStorageKey]);

  const clearStoredConflictDraft = useCallback(() => {
    if (!conflictDraftStorageKey) return;
    try {
      window.sessionStorage.removeItem(conflictDraftStorageKey);
      setHasStoredConflictDraft(false);
    } catch {
      // Ignore session storage failures.
    }
  }, [conflictDraftStorageKey]);

  const downloadStoredConflictDraft = useCallback(() => {
    if (!conflictDraftStorageKey) return;
    try {
      const raw = window.sessionStorage.getItem(conflictDraftStorageKey);
      if (!raw) {
        addToast('Không tìm thấy conflict draft đã lưu tạm.', 'info');
        setHasStoredConflictDraft(false);
        return;
      }

      const payload = JSON.parse(raw) as { capturedAt?: string; snapshot?: RoadmapDocument } | null;
      if (!payload?.snapshot) {
        addToast('Conflict draft bị hỏng hoặc không hợp lệ.', 'error');
        setHasStoredConflictDraft(false);
        return;
      }

      const timestamp = (payload.capturedAt || new Date().toISOString()).replace(/[:.]/g, '-');
      downloadJsonFile(`${CONFLICT_DRAFT_FILE_PREFIX}-${roadmapId || 'roadmap'}-${timestamp}.json`, payload.snapshot);
    } catch {
      addToast('Không thể tải conflict draft đã lưu tạm.', 'error');
    }
  }, [addToast, conflictDraftStorageKey, roadmapId]);

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
    const s = subWeeks(today, beforeWeeks);
    return format(s, 'yyyy-MM-dd');
  }, [today, beforeWeeks]);

  const viewEnd = useMemo(() => {
    const e = endOfMonth(addMonths(today, afterMonths));
    return format(e, 'yyyy-MM-dd');
  }, [today, afterMonths]);

  const hydrateRoadmap = useCallback((json: RoadmapDocument, version: string | null) => {
    const normalized = normalizeDocument(json);
    const legacySettings = normalized.settings ? { ...normalized.settings } : null;
    latestLoadedSettingsRef.current = legacySettings;
    setData(stripViewSettingsFromDocument(normalized));
    setHasUnsavedSharedChanges(false);
    setHasPendingReleaseMetaPatch(false);
    currentVersionRef.current = version;
    setPendingRemoteVersion(null);
    setDismissedVersion(null);
    setConflictState(null);

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
    if (!conflictDraftStorageKey) {
      setHasStoredConflictDraft(false);
      return;
    }

    try {
      setHasStoredConflictDraft(!!window.sessionStorage.getItem(conflictDraftStorageKey));
    } catch {
      setHasStoredConflictDraft(false);
    }
  }, [conflictDraftStorageKey]);

  useEffect(() => {
    if (!roadmapId || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(buildRoadmapChannelName(roadmapId));
    syncChannelRef.current = channel;
    channel.onmessage = (event) => {
      const payload = event.data as { type?: string; version?: string } | null;
      if (payload?.type !== 'roadmap-updated') return;
      const nextVersion = typeof payload.version === 'string' ? payload.version : null;
      if (!isVersionNewer(nextVersion, currentVersionRef.current)) return;
      setDismissedVersion(null);
      setPendingRemoteVersion(nextVersion);
    };

    return () => {
      channel.close();
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
    };
  }, [roadmapId]);

  const checkRemoteVersion = useCallback(async () => {
    const latestVersion = await fetchRoadmapVersion();
    if (!latestVersion) return;

    const currentVersion = currentVersionRef.current;
    if (!currentVersion) {
      currentVersionRef.current = latestVersion;
      return;
    }

    if (!isVersionNewer(latestVersion, currentVersion)) return;
    if (isMatchingVersion(dismissedVersion, latestVersion)) return;

    setPendingRemoteVersion(latestVersion);
  }, [dismissedVersion, fetchRoadmapVersion]);

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

            if (!nextVersion) {
              void checkRemoteVersion();
              return;
            }

            if (!isVersionNewer(nextVersion, currentVersionRef.current)) return;
            // Skip realtime events triggered by our own save — the HTTP response
            // handler will update currentVersionRef and clear pendingRemoteVersion.
            if (saveInFlightRef.current) return;
            setDismissedVersion(null);
            setPendingRemoteVersion(nextVersion);
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
      const confirmed = await showConfirm('Đang có thay đổi local chưa lưu. App sẽ lưu tạm một backup local trước khi đăng xuất. Tiếp tục?');
      if (!confirmed) return;
      if (data) {
        persistConflictDraft(buildJsonBackupSnapshot(data));
        addToast('Đã lưu local draft tạm trước khi đăng xuất.', 'info');
      }
    }
    await logoutGoogle();
    setGuestMode(false);
  }, [addToast, buildJsonBackupSnapshot, data, hasUnsavedSharedChanges, logoutGoogle, persistConflictDraft, showConfirm]);

  const exportVisibleRows = useMemo(() => {
    if (!data) return [];
    const filters = {
      category: filterCategory, status: filterStatus, team: filterTeam,
      priority: filterPriority, phase: filterPhase, subcategory: filterSubcategory,
      groupItemType: filterGroupItemType,
    };
    return getVisibleFlattenedRows(data.items, filters, expandedIds, hiddenRowIds);
  }, [data, filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType, expandedIds, hiddenRowIds]);

  const exportSummaryRows = useMemo(() => {
    if (!data) return [];
    const filters = {
      category: filterCategory, status: filterStatus, team: filterTeam,
      priority: filterPriority, phase: filterPhase, subcategory: filterSubcategory,
      groupItemType: filterGroupItemType,
    };
    const filteredItems = filterRoadmapTree(data.items, filters);
    return flattenRoadmap(filteredItems);
  }, [data, filterCategory, filterStatus, filterTeam, filterPriority, filterPhase, filterSubcategory, filterGroupItemType]);

  const exportVisibleColumns = useMemo<ExcelExportColumn[]>(() => {
    const cols: ExcelExportColumn[] = [
      { id: 'id', header: 'ID' },
      { id: 'name', header: 'Tên' },
      { id: 'note', header: 'Note' },
    ];
    if (showWorkType) cols.push({ id: 'workType', header: 'WorkType' });
    if (showPriority) cols.push({ id: 'priority', header: 'Priority' });
    cols.push({ id: 'status', header: 'Status' });
    if (showPhase) cols.push({ id: 'phase', header: 'Week' });
    if (showStartDate) cols.push({ id: 'startDate', header: 'Ngày bắt đầu' });
    if (showEndDate) cols.push({ id: 'endDate', header: 'Ngày kết thúc' });
    return cols;
  }, [showWorkType, showPriority, showPhase, showStartDate, showEndDate]);

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

  const ensureCanSaveCurrentVersion = useCallback(() => {
    if (conflictState) {
      addToast('Roadmap đang bị conflict với bản mới hơn trên hệ thống. Hãy tải bản mới nhất trước khi lưu tiếp.', 'error');
      return false;
    }

    if (pendingRemoteVersion || dismissedVersion) {
      addToast('Đã có phiên bản mới hơn trên hệ thống. Hãy tải bản mới nhất trước khi lưu để tránh ghi đè dữ liệu.', 'error');
      return false;
    }

    return true;
  }, [addToast, conflictState, dismissedVersion, pendingRemoteVersion]);

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
    if (!ensureCanSaveCurrentVersion()) return;

    const baseVersion = await resolveBaseVersion();
    if (!baseVersion) {
      addToast('Không thể xác định phiên bản hiện tại của roadmap. Vui lòng tải lại dữ liệu trước khi lưu.', 'error');
      return;
    }

    setSaving(true);
    saveInFlightRef.current = true;
    setSaveState('idle');
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
        if (res.status === 409 || payload?.code === VERSION_CONFLICT_CODE) {
          persistConflictDraft(buildJsonBackupSnapshot(currentData));
          setConflictState({
            message: typeof payload?.message === 'string'
              ? payload.message
              : 'Roadmap đã được cập nhật bởi người khác.',
            serverVersion: typeof payload?.serverVersion === 'string' ? payload.serverVersion : null,
          });
          if (typeof payload?.serverVersion === 'string') {
            setPendingRemoteVersion(payload.serverVersion);
          }
          addToast('Lưu tên roadmap bị chặn để tránh ghi đè dữ liệu mới hơn. Bản local đã được giữ tạm để bạn backup.', 'error');
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
        setPendingRemoteVersion(null);
        setDismissedVersion(null);
        setConflictState(null);
        setHasUnsavedSharedChanges(false);
        setHasPendingReleaseMetaPatch(false);
        addToast('Đã lưu tên roadmap.', 'success');
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
      if (res.status === 409 || payload?.code === VERSION_CONFLICT_CODE) {
        persistConflictDraft(buildJsonBackupSnapshot(currentData));
        setConflictState({
          message: typeof payload?.message === 'string'
            ? payload.message
            : 'Roadmap đã được cập nhật bởi người khác.',
          serverVersion: typeof payload?.serverVersion === 'string' ? payload.serverVersion : null,
        });
        if (typeof payload?.serverVersion === 'string') {
          setPendingRemoteVersion(payload.serverVersion);
        }
        addToast('Lưu bị chặn để tránh ghi đè dữ liệu mới hơn. Bản local đã được giữ tạm để bạn backup.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        return;
      }
      if (!res.ok) throw new Error();
      addToast('Đã lưu thành công.', 'success');
      const latestVersion = typeof payload?.updatedAt === 'string'
        ? payload.updatedAt
        : await fetchRoadmapVersion();
      if (latestVersion) {
        currentVersionRef.current = latestVersion;
        broadcastVersionUpdate(latestVersion);
      }
      setPendingRemoteVersion(null);
      setDismissedVersion(null);
      setConflictState(null);
      setHasUnsavedSharedChanges(false);
      setHasPendingReleaseMetaPatch(false);
      setSaveState('success');
      setSaveTick(prev => prev + 1);
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    accessToken,
    addToast,
    authUser,
    broadcastVersionUpdate,
    buildJsonBackupSnapshot,
    buildSharedDocumentSnapshot,
    ensureCanManageRoadmap,
    ensureCanSaveCurrentVersion,
    fetchRoadmapVersion,
    persistConflictDraft,
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
    if (!ensureCanSaveCurrentVersion()) return;

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
      if (res.status === 409 || payload?.code === VERSION_CONFLICT_CODE) {
        persistConflictDraft(buildJsonBackupSnapshot(normalizedOptimistic));
        setConflictState({
          message: typeof payload?.message === 'string'
            ? payload.message
            : 'Roadmap đã được cập nhật bởi người khác.',
          serverVersion: typeof payload?.serverVersion === 'string' ? payload.serverVersion : null,
        });
        if (typeof payload?.serverVersion === 'string') {
          setPendingRemoteVersion(payload.serverVersion);
        }
        addToast('Thay đổi local đã được giữ tạm. Hãy tải bản mới nhất trước khi lưu tiếp để tránh conflict.', 'error');
        setSaveState('error');
        setSaveTick(prev => prev + 1);
        return;
      }

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
    buildJsonBackupSnapshot,
    ensureCanSaveCurrentVersion,
    hydrateRoadmap,
    loadRoadmap,
    normalizeDocument,
    persistConflictDraft,
    resolveBaseVersion,
    roadmapId,
  ]);

  const handleExportExcelCurrentView = async () => {
    if (!data) return;
    try {
      const built = buildRoadmapExcelFile(data, {
        mode: 'current-view',
        rows: exportVisibleRows,
        summaryRows: exportSummaryRows,
        columns: exportVisibleColumns,
        includeSummary: true,
      });

      const res = await fetch('/api/export/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: built.fileName,
          contentBase64: arrayBufferToBase64(built.excelBuffer),
        }),
      });

      if (!res.ok) throw new Error(`Export timeline failed: ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      const relativePath = typeof payload?.relativePath === 'string'
        ? payload.relativePath
        : `storage/timeline-exports/${built.fileName}`;
      addToast(`Đã lưu Excel (Current View) vào ${relativePath}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi xuất Excel (Current View).', 'error');
    }
  };

  const handleExportExcelFullData = async () => {
    if (!data) return;
    try {
      const built = buildRoadmapExcelFile(data, { mode: 'full-data', includeSummary: false });

      const res = await fetch('/api/export/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: built.fileName,
          contentBase64: arrayBufferToBase64(built.excelBuffer),
        }),
      });

      if (!res.ok) throw new Error(`Export timeline failed: ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      const relativePath = typeof payload?.relativePath === 'string'
        ? payload.relativePath
        : `storage/timeline-exports/${built.fileName}`;
      addToast(`Đã lưu Excel (Full Data) vào ${relativePath}`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi xuất Excel (Full Data).', 'error');
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
      if (!ensureCanSaveCurrentVersion()) return;

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
        if (res.status === 409 || payload?.code === VERSION_CONFLICT_CODE) {
          persistConflictDraft(buildJsonBackupSnapshot(optimisticData));
          setConflictState({
            message: typeof payload?.message === 'string'
              ? payload.message
              : 'Roadmap đã được cập nhật bởi người khác.',
            serverVersion: typeof payload?.serverVersion === 'string' ? payload.serverVersion : null,
          });
          if (typeof payload?.serverVersion === 'string') {
            setPendingRemoteVersion(payload.serverVersion);
          }
          addToast('Thay đổi week đã được giữ tạm. Hãy tải bản mới nhất trước khi lưu tiếp để tránh conflict.', 'error');
          setSaveState('error');
          setSaveTick(prev => prev + 1);
          return;
        }

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

  useEffect(() => {
    if (!isReportedMode) return;
    setFilterPriority(prev => ensureReportedPriority(prev));
  }, [isReportedMode]);

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
    setData(stripViewSettingsFromDocument(normalizeDocument({ ...data, items: [...data.items, newItem] })));
    setHasUnsavedSharedChanges(true);
    setHasPendingReleaseMetaPatch(false);
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

  const downloadCurrentLocalDraft = useCallback(() => {
    if (!data) return;
    downloadJsonFile(
      `${CONFLICT_DRAFT_FILE_PREFIX}-${roadmapId || 'roadmap'}-local.json`,
      buildJsonBackupSnapshot(data)
    );
  }, [buildJsonBackupSnapshot, data, roadmapId]);

  const dismissVersionNotice = useCallback(() => {
    if (pendingRemoteVersion) setDismissedVersion(pendingRemoteVersion);
    setPendingRemoteVersion(null);
  }, [pendingRemoteVersion]);

  const refreshForLatestData = useCallback(async () => {
    if (hasUnsavedSharedChanges) {
      const confirmed = await showConfirm('Đang có thay đổi local chưa lưu. App sẽ lưu tạm một backup local rồi tải bản mới nhất từ hệ thống. Tiếp tục?');
      if (!confirmed) return;
    }

    if (data) {
      persistConflictDraft(buildJsonBackupSnapshot(data));
      addToast('Đã lưu local draft tạm trước khi tải bản mới nhất.', 'info');
    }

    const loaded = await loadRoadmap();
    if (loaded) {
      addToast('Đã tải phiên bản mới nhất từ hệ thống.', 'success');
    }
  }, [addToast, buildJsonBackupSnapshot, data, hasUnsavedSharedChanges, loadRoadmap, persistConflictDraft, showConfirm]);

  const handleBackToHome = useCallback(async () => {
    if (hasUnsavedSharedChanges) {
      const confirmed = await showConfirm('Đang có thay đổi local chưa lưu. App sẽ lưu tạm một backup local trước khi quay về trang chủ. Tiếp tục?');
      if (!confirmed) return;
      if (data) {
        persistConflictDraft(buildJsonBackupSnapshot(data));
        addToast('Đã lưu local draft tạm trước khi quay về trang chủ.', 'info');
      }
    }

    router.push('/');
  }, [addToast, buildJsonBackupSnapshot, data, hasUnsavedSharedChanges, persistConflictDraft, router, showConfirm]);

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
        />
      )}

      {hasStoredConflictDraft && (
        <div className="shrink-0 border-b border-sky-300 bg-sky-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-sky-800">
              Có một local draft đã được lưu tạm sau khi gặp conflict hoặc refresh an toàn.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-sky-300 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                onClick={clearStoredConflictDraft}
              >
                Xóa backup
              </button>
              <button
                type="button"
                className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
                onClick={downloadStoredConflictDraft}
              >
                Tải backup JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {conflictState && (
        <div className="shrink-0 border-b border-rose-300 bg-rose-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-rose-800">
                {conflictState.message}
              </p>
              <p className="mt-0.5 text-[11px] text-rose-700">
                Bản local đang được giữ lại tạm thời. Hãy tải backup hoặc tải phiên bản mới nhất trước khi lưu tiếp.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                onClick={downloadCurrentLocalDraft}
              >
                Tải backup local
              </button>
              <button
                type="button"
                className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                onClick={() => { void refreshForLatestData(); }}
              >
                Tải bản mới nhất
              </button>
            </div>
          </div>
        </div>
      )}

      {!conflictState && pendingRemoteVersion && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-800">
              Có dữ liệu mới trên hệ thống. Hãy tải bản mới nhất trước khi lưu để tránh ghi đè dữ liệu.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-amber-400 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                onClick={dismissVersionNotice}
              >
                Để sau
              </button>
              <button
                type="button"
                className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                onClick={() => { void refreshForLatestData(); }}
              >
                Tải bản mới nhất
              </button>
            </div>
          </div>
        </div>
      )}

      <Toolbar
        documentName={data.releaseName}
        onNameChange={handleNameChange}
        onSave={() => handleSave(data)}
        onExportExcelCurrentView={handleExportExcelCurrentView}
        onExportExcelFullData={handleExportExcelFullData}
        onDownloadJson={handleDownloadJson}
        onOpenFilterPopup={openFilterPopup}
        onOpenMilestonesPopup={openMilestonesPopup}
        isFilterPopupOpen={showFilterPopup}
        isMilestonesPopupOpen={showMilestones}
        beforeWeeks={beforeWeeks}
        afterMonths={afterMonths}
        onBeforeWeeksChange={setBeforeWeeks}
        onAfterMonthsChange={setAfterMonths}
        onLoadJson={handleLoadJson}
        isSaving={saving}
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
      />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid
          key={canManageRoadmap ? 'admin-grid' : authUser ? 'manager-grid' : 'viewer-grid'}
          data={data}
          onDataChange={handleDataChange}
          onRootAdd={handleRootAdd}
          showConfirm={showConfirm}
          viewStart={viewStart}
          viewEnd={viewEnd}
          timelineMode={timelineMode}
          timelineOnly={timelineOnly}
          timelineTaskW={timelineTaskWidth}
          setTimelineTaskW={setTimelineTaskWidth}
          filterCategory={filterCategory}
          filterStatus={filterStatus}
          filterTeam={filterTeam}
          filterPriority={filterPriority}
          filterPhase={filterPhase}
          filterSubcategory={filterSubcategory}
          filterGroupItemType={filterGroupItemType}
          reportedMode={isReportedMode}
          isSaving={saving}
          saveState={saveState}
          saveTick={saveTick}
          currentUser={authUser}
          documentPermission={documentPermission}
          onManagerFieldChanges={handleManagerFieldChanges}
          showWorkType={showWorkType} setShowWorkType={setShowWorkType}
          showPriority={showPriority} setShowPriority={setShowPriority}
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
        />
      </div>
      <TimelineModeFab mode={timelineMode} onModeChange={setTimelineMode} />
    </main>
  );
}
