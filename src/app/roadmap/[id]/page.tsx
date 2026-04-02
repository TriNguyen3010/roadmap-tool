'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
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
import type { EditPermission, ManagerFieldChange } from '@/types/auth';
import {
  ColumnWidthMode,
  Milestone,
  PhaseOption,
  RoadmapDocument,
  RoadmapItem,
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
import { buildRoadmapExcelFile, type ExcelExportColumn } from '@/utils/exportToExcel';
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
  return (value || '').trim();
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
  if (!milestones) return milestones;
  return milestones.map((milestone, index) => {
    const id = (milestone.id || '').trim() || `phase_${index + 1}`;
    const label = normalizeWeekLabel(milestone.label, index);
    const color = normalizeWeekColor(milestone.color, index);
    let startDate = normalizeDateValue(milestone.startDate);
    let endDate = normalizeDateValue(milestone.endDate);

    if (startDate && !endDate) {
      endDate = startDate;
    } else if (!startDate && endDate) {
      startDate = endDate;
    }

    return {
      ...milestone,
      id,
      label,
      color,
      startDate,
      endDate,
    };
  });
}

function normalizeItemTree(items: RoadmapItem[]): RoadmapItem[] {
  return items.map(item => {
    const normalizedType = normalizeItemType(item.type);
    const { workType: legacyWorkType, ...itemWithoutLegacyWorkType } = item as RoadmapItem & { workType?: string };
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
  const [pendingRemoteVersion, setPendingRemoteVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const currentVersionRef = useRef<string | null>(null);

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

  const ensureCanManageRoadmap = useCallback(() => {
    if (canManageRoadmap) return true;
    addToast('Tài khoản hiện tại không có quyền chỉnh sửa cấu trúc roadmap.', 'error');
    return false;
  }, [addToast, canManageRoadmap]);

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
    setData(normalized);
    currentVersionRef.current = version;
    setPendingRemoteVersion(null);
    setDismissedVersion(null);
    setTimelineOnly(!!json.settings?.timelineOnly);
    setTimelineTaskWidth(clampTimelineTaskWidth(
      typeof json.settings?.timelineTaskWidth === 'number'
        ? json.settings.timelineTaskWidth
        : DEFAULT_TIMELINE_TASK_WIDTH
    ));

    if (json.settings) {
      if (typeof json.settings.beforeWeeks === 'number') setBeforeWeeks(json.settings.beforeWeeks);
      if (typeof json.settings.afterMonths === 'number') setAfterMonths(json.settings.afterMonths);
      if (json.settings.filterCategory) setFilterCategory(json.settings.filterCategory);
      if (json.settings.filterStatus) setFilterStatus(normalizeStatusFilter(json.settings.filterStatus));
      if (json.settings.filterTeam) setFilterTeam(json.settings.filterTeam);
      const normalizedPriority = json.settings.filterPriority
        ? normalizePriorityFilterValues(json.settings.filterPriority)
        : [];
      const shouldResetReportedMode = json.settings.reportedMode === true;
      setFilterPriority(shouldResetReportedMode ? removeReportedPriority(normalizedPriority) : normalizedPriority);
      if (json.settings.filterPhase) setFilterPhase(normalizePhaseFilterValues(json.settings.filterPhase));
      if (json.settings.filterSubcategory) setFilterSubcategory(stripQuickViewSubcategories(json.settings.filterSubcategory));
      if (json.settings.filterGroupItemType) setFilterGroupItemType(normalizeGroupItemTypeFilter(json.settings.filterGroupItemType));
      setIsReportedMode(false);
      if (typeof json.settings.colWorkType === 'boolean') setShowWorkType(json.settings.colWorkType);
      if (typeof json.settings.colPriority === 'boolean') setShowPriority(json.settings.colPriority);
      if (typeof json.settings.colPhase === 'boolean') setShowPhase(json.settings.colPhase);
      if (typeof json.settings.colStartDate === 'boolean') setShowStartDate(json.settings.colStartDate);
      if (typeof json.settings.colEndDate === 'boolean') setShowEndDate(json.settings.colEndDate);
      if (typeof json.settings.colFeaturesWidth === 'number') {
        setFeaturesColWidth(clampFeaturesColWidth(json.settings.colFeaturesWidth));
      }
      if (json.settings.colFeaturesWidthMode === 'auto' || json.settings.colFeaturesWidthMode === 'manual') {
        setFeaturesColWidthMode(json.settings.colFeaturesWidthMode);
      } else if (typeof json.settings.colFeaturesWidth === 'number') {
        setFeaturesColWidthMode('manual');
      }
      if (json.settings.timelineMode === 'day' || json.settings.timelineMode === 'week' || json.settings.timelineMode === 'month') {
        setTimelineMode(json.settings.timelineMode);
      }
      if (typeof json.settings.timelineTaskWidth === 'number') {
        setTimelineTaskWidth(clampTimelineTaskWidth(json.settings.timelineTaskWidth));
      }
      if (json.settings.expandedIds) {
        setExpandedIds(new Set(json.settings.expandedIds));
        hasInitializedExpansion.current = true;
      }
      if (json.settings.hiddenRowIds) setHiddenRowIds(new Set(json.settings.hiddenRowIds));
    }

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
  }, [normalizeDocument]);

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

  const checkRemoteVersion = useCallback(async () => {
    const latestVersion = await fetchRoadmapVersion();
    if (!latestVersion) return;

    const currentVersion = currentVersionRef.current;
    if (!currentVersion) {
      currentVersionRef.current = latestVersion;
      return;
    }

    const currentTs = Date.parse(currentVersion);
    const latestTs = Date.parse(latestVersion);
    const hasNewerVersion = Number.isFinite(currentTs) && Number.isFinite(latestTs)
      ? latestTs > currentTs
      : latestVersion !== currentVersion;

    if (!hasNewerVersion) return;
    if (dismissedVersion === latestVersion) return;

    setPendingRemoteVersion(latestVersion);
  }, [dismissedVersion, fetchRoadmapVersion]);

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
    await logoutGoogle();
    setGuestMode(false);
  }, [logoutGoogle]);

  const buildDocumentSnapshot = useCallback((baseData: RoadmapDocument): RoadmapDocument => ({
    ...baseData,
    settings: {
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
    }
  }), [
    beforeWeeks, afterMonths, filterCategory, filterStatus, filterTeam,
    filterPriority, filterPhase, filterSubcategory, filterGroupItemType,
    isReportedMode, showWorkType, showPriority, showPhase, showStartDate,
    showEndDate, featuresColWidth, featuresColWidthMode, timelineMode, timelineOnly,
    timelineTaskWidth,
    expandedIds, hiddenRowIds,
  ]);

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

  const handleSave = useCallback(async (currentData: RoadmapDocument) => {
    if (!ensureCanManageRoadmap()) return;
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu roadmap.', 'error');
      return;
    }
    setSaving(true);
    setSaveState('idle');
    try {
      const dataToSave = buildDocumentSnapshot(currentData);

      const res = await fetch(`/api/roadmap/${roadmapId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(dataToSave),
      });
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
      if (!res.ok) throw new Error();
      addToast('Đã lưu thành công.', 'success');
      const latestVersion = await fetchRoadmapVersion();
      if (latestVersion) {
        currentVersionRef.current = latestVersion;
      }
      setPendingRemoteVersion(null);
      setDismissedVersion(null);
      setSaveState('success');
      setSaveTick(prev => prev + 1);
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
    } finally {
      setSaving(false);
    }
  }, [accessToken, addToast, authUser, buildDocumentSnapshot, ensureCanManageRoadmap, fetchRoadmapVersion, roadmapId]);

  const handleManagerFieldChanges = useCallback(async (changes: ManagerFieldChange[], optimisticData: RoadmapDocument) => {
    if (!authUser || !accessToken) {
      addToast('Bạn cần đăng nhập lại để lưu thay đổi.', 'error');
      return;
    }

    const normalizedOptimistic = normalizeDocument(optimisticData);
    setData(normalizedOptimistic);
    setSaving(true);
    setSaveState('idle');

    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/manager-save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ changes }),
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

      setSaveState('success');
      setSaveTick(prev => prev + 1);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Lỗi khi lưu thay đổi manager.', 'error');
      setSaveState('error');
      setSaveTick(prev => prev + 1);
      await loadRoadmap();
    } finally {
      setSaving(false);
    }
  }, [accessToken, addToast, authUser, hydrateRoadmap, loadRoadmap, normalizeDocument, roadmapId]);

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
  };

  const handleMilestonesSave = (milestones: Milestone[]) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    const newData = normalizeDocument({ ...data, milestones });
    setData(newData);
    handleSave(newData);
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
      setData(nextData);
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
    setData(normalized);
    if (shouldSave) {
      handleSave(normalized);
    }
  };

  const handleRootAdd = (newItem: RoadmapItem) => {
    if (!ensureCanManageRoadmap()) return;
    if (!data) return;
    setData(normalizeDocument({ ...data, items: [...data.items, newItem] }));
  };

  const handleLoadJson = async (jsonData: unknown) => {
    if (!ensureCanManageRoadmap()) return;
    const parsed = jsonData as Partial<RoadmapDocument> | null;
    if (!parsed || !Array.isArray(parsed.items)) {
      addToast('File JSON không hợp lệ, thiếu `items`', 'error');
      return;
    }
    const yes = await showConfirm('Bạn có chắc chắn muốn ĐÈ BẢN LƯU bằng file JSON vừa tải lên không?');
    if (!yes) return;

    const normalized = normalizeDocument(parsed as RoadmapDocument);
    setData(normalized);
    setTimelineOnly(!!parsed.settings?.timelineOnly);
    setTimelineTaskWidth(clampTimelineTaskWidth(
      typeof parsed.settings?.timelineTaskWidth === 'number'
        ? parsed.settings.timelineTaskWidth
        : DEFAULT_TIMELINE_TASK_WIDTH
    ));
    if (parsed.settings) {
      const settings = parsed.settings as Record<string, unknown>;
      const toStringArray = (value: unknown): string[] => (
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      );
      if (typeof settings.beforeWeeks === 'number') setBeforeWeeks(settings.beforeWeeks);
      if (typeof settings.afterMonths === 'number') setAfterMonths(settings.afterMonths);
      if (Array.isArray(settings.filterCategory)) setFilterCategory(toStringArray(settings.filterCategory));
      if (Array.isArray(settings.filterStatus)) setFilterStatus(normalizeStatusFilter(toStringArray(settings.filterStatus)));
      if (Array.isArray(settings.filterTeam)) setFilterTeam(toStringArray(settings.filterTeam));
      if (Array.isArray(settings.filterPriority)) setFilterPriority(normalizePriorityFilterValues(toStringArray(settings.filterPriority)));
      if (Array.isArray(settings.filterPhase)) setFilterPhase(normalizePhaseFilterValues(toStringArray(settings.filterPhase)));
      if (Array.isArray(settings.filterSubcategory)) setFilterSubcategory(toStringArray(settings.filterSubcategory));
      if (Array.isArray(settings.filterGroupItemType)) setFilterGroupItemType(normalizeGroupItemTypeFilter(toStringArray(settings.filterGroupItemType)));
      if (typeof settings.reportedMode === 'boolean') setIsReportedMode(settings.reportedMode);
      if (typeof settings.colWorkType === 'boolean') setShowWorkType(settings.colWorkType);
      if (typeof settings.colPriority === 'boolean') setShowPriority(settings.colPriority);
      if (typeof settings.colPhase === 'boolean') setShowPhase(settings.colPhase);
      if (typeof settings.colStartDate === 'boolean') setShowStartDate(settings.colStartDate);
      if (typeof settings.colEndDate === 'boolean') setShowEndDate(settings.colEndDate);
      if (typeof settings.colFeaturesWidth === 'number') {
        setFeaturesColWidth(clampFeaturesColWidth(settings.colFeaturesWidth));
      }
      if (settings.colFeaturesWidthMode === 'auto' || settings.colFeaturesWidthMode === 'manual') {
        setFeaturesColWidthMode(settings.colFeaturesWidthMode);
      } else if (typeof settings.colFeaturesWidth === 'number') {
        setFeaturesColWidthMode('manual');
      }
      if (settings.timelineMode === 'day' || settings.timelineMode === 'week' || settings.timelineMode === 'month') {
        setTimelineMode(settings.timelineMode as TimelineMode);
      }
      if (typeof settings.timelineTaskWidth === 'number') {
        setTimelineTaskWidth(clampTimelineTaskWidth(settings.timelineTaskWidth));
      }
      if (Array.isArray(settings.expandedIds)) {
        setExpandedIds(new Set(toStringArray(settings.expandedIds)));
        hasInitializedExpansion.current = true;
      }
      if (Array.isArray(settings.hiddenRowIds)) {
        setHiddenRowIds(new Set(toStringArray(settings.hiddenRowIds)));
      }
    }
    await handleSave(normalized);
  };

  const handleDownloadJson = async () => {
    if (!data) return;
    try {
      const snapshot = buildDocumentSnapshot(data);
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

  const dismissVersionNotice = useCallback(() => {
    if (pendingRemoteVersion) setDismissedVersion(pendingRemoteVersion);
    setPendingRemoteVersion(null);
  }, [pendingRemoteVersion]);

  const refreshForLatestData = useCallback(() => {
    window.location.reload();
  }, []);

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
          canEdit={canManageRoadmap}
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
          onSaveView={() => handleSave(data)}
        />
      )}

      {pendingRemoteVersion && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-800">
              Có dữ liệu mới trên hệ thống. Bấm Refresh để lấy phiên bản mới nhất.
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
                onClick={refreshForLatestData}
              >
                Refresh
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
        onBackToHome={() => router.push('/')}
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
