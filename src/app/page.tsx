'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
import Toolbar, { type QuickViewMode } from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import MilestoneEditor from '@/components/MilestoneEditor';
import FilterPopup from '@/components/FilterPopup';
import TimelineModeFab from '@/components/TimelineModeFab';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
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
  normalizeStatusFilter,
  toLegacyImageFields
} from '@/types/roadmap';
import { exportRoadmapToExcel, type ExcelExportColumn } from '@/utils/exportToExcel';
import { getVisibleFlattenedRows, recalculateRoadmap } from '@/utils/roadmapHelpers';

const DEFAULT_FEATURES_COL_WIDTH = 260;
const MIN_FEATURES_COL_WIDTH = 120;
const MAX_FEATURES_COL_WIDTH = 450;
const DEFAULT_TIMELINE_MODE: TimelineMode = 'day';
const VERSION_POLL_INTERVAL_MS = 20_000;

function clampFeaturesColWidth(width: number): number {
  return Math.max(MIN_FEATURES_COL_WIDTH, Math.min(MAX_FEATURES_COL_WIDTH, width));
}

function normalizeDateValue(value: string | undefined): string {
  return (value || '').trim();
}

function normalizeMilestones(milestones: Milestone[] | undefined): Milestone[] | undefined {
  if (!milestones) return milestones;
  return milestones.map((milestone, index) => {
    const id = (milestone.id || '').trim() || `phase_${index + 1}`;
    const label = (milestone.label || '').trim() || `Phase ${index + 1}`;
    const color = (milestone.color || '').trim() || '#3b82f6';
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

export default function Home() {
  const [data, setData] = useState<RoadmapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingRemoteVersion, setPendingRemoteVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const currentVersionRef = useRef<string | null>(null);

  // Timeline window: how many weeks before & months after today
  const [beforeWeeks, setBeforeWeeks] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  // View settings
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterPhase, setFilterPhase] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterGroupItemType, setFilterGroupItemType] = useState<string[]>([]);

  // Column visibility
  const [showWorkType, setShowWorkType] = useState(true);
  const [showPriority, setShowPriority] = useState(true);
  const [showPhase, setShowPhase] = useState(true);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [featuresColWidth, setFeaturesColWidth] = useState(DEFAULT_FEATURES_COL_WIDTH);
  const [featuresColWidthMode, setFeaturesColWidthMode] = useState<ColumnWidthMode>('auto');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(DEFAULT_TIMELINE_MODE);

  // Row visibility & expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
  // This ref ensures we only auto-expand once on initial load if no saved state exists
  const hasInitializedExpansion = useRef(false);

  const { toasts, addToast, removeToast } = useToast();

  const ensureEditor = useCallback(() => {
    if (isEditor) return true;
    addToast('Bạn đang ở chế độ Viewer. Hãy unlock Editor để chỉnh sửa.', 'error');
    return false;
  }, [isEditor, addToast]);

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
    items: recalculateRoadmap(normalizeItemTree(doc.items || [])),
  }), []);

  const fetchRoadmapVersion = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/roadmap/version', { cache: 'no-store' });
      if (!res.ok) return null;
      const payload = await res.json().catch(() => ({}));
      return typeof payload?.updatedAt === 'string' ? payload.updatedAt : null;
    } catch {
      return null;
    }
  }, []);

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

  // viewStart: today minus beforeWeeks
  // viewEnd:   today plus afterMonths (end of that month)
  const today = useMemo(() => startOfDay(new Date()), []);

  const viewStart = useMemo(() => {
    const s = subWeeks(today, beforeWeeks);
    return format(s, 'yyyy-MM-dd');
  }, [today, beforeWeeks]);

  const viewEnd = useMemo(() => {
    const e = endOfMonth(addMonths(today, afterMonths));
    return format(e, 'yyyy-MM-dd');
  }, [today, afterMonths]);

  useEffect(() => {
    let cancelled = false;

    const loadRoadmap = async () => {
      try {
        const [roadmapRes, version] = await Promise.all([
          fetch('/api/roadmap', { cache: 'no-store' }),
          fetchRoadmapVersion(),
        ]);
        if (!roadmapRes.ok) throw new Error('roadmap fetch failed');

        const json = await roadmapRes.json();
        if (cancelled) return;

        const normalized = normalizeDocument(json);
        setData(normalized);
        currentVersionRef.current = version;
        setPendingRemoteVersion(null);
        setDismissedVersion(null);

        if (json.settings) {
          if (typeof json.settings.beforeWeeks === 'number') setBeforeWeeks(json.settings.beforeWeeks);
          if (typeof json.settings.afterMonths === 'number') setAfterMonths(json.settings.afterMonths);
          if (json.settings.filterCategory) setFilterCategory(json.settings.filterCategory);
          if (json.settings.filterStatus) setFilterStatus(normalizeStatusFilter(json.settings.filterStatus));
          if (json.settings.filterTeam) setFilterTeam(json.settings.filterTeam);
          if (json.settings.filterPriority) setFilterPriority(normalizePriorityFilterValues(json.settings.filterPriority));
          if (json.settings.filterPhase) setFilterPhase(normalizePhaseFilterValues(json.settings.filterPhase));
          if (json.settings.filterSubcategory) setFilterSubcategory(json.settings.filterSubcategory);
          if (json.settings.filterGroupItemType) setFilterGroupItemType(normalizeGroupItemTypeFilter(json.settings.filterGroupItemType));
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
          if (json.settings.expandedIds) {
            setExpandedIds(new Set(json.settings.expandedIds));
            hasInitializedExpansion.current = true;
          }
          if (json.settings.hiddenRowIds) setHiddenRowIds(new Set(json.settings.hiddenRowIds));
        }

        // If no saved expansion state, default to expanding all groups
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
      } catch {
        if (!cancelled) addToast('Không thể tải dữ liệu roadmap.json', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRoadmap();
    return () => {
      cancelled = true;
    };
  }, [addToast, normalizeDocument, fetchRoadmapVersion]);

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

    const poll = () => {
      void checkRemoteVersion();
    };
    const intervalId = window.setInterval(poll, VERSION_POLL_INTERVAL_MS);

    const onFocus = () => {
      poll();
    };
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

  useEffect(() => {
    fetch('/api/auth/editor/session')
      .then(res => res.json())
      .then(json => setIsEditor(!!json?.isEditor))
      .catch(() => setIsEditor(false))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleUnlockEditor = useCallback(async (password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch('/api/auth/editor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: payload?.error || 'Mật khẩu không đúng' };
      }
      setIsEditor(true);
      addToast('Đã mở khóa chế độ Editor.', 'success');
      return { success: true };
    } catch {
      return { success: false, message: 'Không thể xác thực. Vui lòng thử lại.' };
    }
  }, [addToast]);

  const handleLockEditor = useCallback(async () => {
    try {
      await fetch('/api/auth/editor/logout', { method: 'POST' });
    } finally {
      setIsEditor(false);
      setShowMilestones(false);
      addToast('Đã chuyển về chế độ Viewer.', 'success');
    }
  }, [addToast]);

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
      colWorkType: showWorkType,
      colPriority: showPriority,
      colPhase: showPhase,
      colStartDate: showStartDate,
      colEndDate: showEndDate,
      colFeaturesWidth: clampFeaturesColWidth(featuresColWidth),
      colFeaturesWidthMode: featuresColWidthMode,
      timelineMode,
      expandedIds: Array.from(expandedIds),
      hiddenRowIds: Array.from(hiddenRowIds),
    }
  }), [
    beforeWeeks,
    afterMonths,
    filterCategory,
    filterStatus,
    filterTeam,
    filterPriority,
    filterPhase,
    filterSubcategory,
    filterGroupItemType,
    showWorkType,
    showPriority,
    showPhase,
    showStartDate,
    showEndDate,
    featuresColWidth,
    featuresColWidthMode,
    timelineMode,
    expandedIds,
    hiddenRowIds,
  ]);

  const exportVisibleRows = useMemo(() => {
    if (!data) return [];
    return getVisibleFlattenedRows(
      data.items,
      {
        category: filterCategory,
        status: filterStatus,
        team: filterTeam,
        priority: filterPriority,
        phase: filterPhase,
        subcategory: filterSubcategory,
        groupItemType: filterGroupItemType,
      },
      expandedIds,
      hiddenRowIds
    );
  }, [
    data,
    filterCategory,
    filterStatus,
    filterTeam,
    filterPriority,
    filterPhase,
    filterSubcategory,
    filterGroupItemType,
    expandedIds,
    hiddenRowIds,
  ]);

  const exportVisibleColumns = useMemo<ExcelExportColumn[]>(() => {
    const cols: ExcelExportColumn[] = [
      { id: 'id', header: 'ID' },
      { id: 'name', header: 'Tên' },
    ];
    if (showWorkType) cols.push({ id: 'workType', header: 'WorkType' });
    if (showPriority) cols.push({ id: 'priority', header: 'Priority' });
    cols.push({ id: 'status', header: 'Status' });
    if (showPhase) cols.push({ id: 'phase', header: 'Phase' });
    if (showStartDate) cols.push({ id: 'startDate', header: 'Ngày bắt đầu' });
    if (showEndDate) cols.push({ id: 'endDate', header: 'Ngày kết thúc' });
    return cols;
  }, [showWorkType, showPriority, showPhase, showStartDate, showEndDate]);

  const handleSave = useCallback(async (currentData: RoadmapDocument) => {
    if (!ensureEditor()) return;
    setSaving(true);
    try {
      const dataToSave = buildDocumentSnapshot(currentData);

      const res = await fetch('/api/roadmap/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      if (res.status === 401) {
        setIsEditor(false);
        addToast('Phiên Editor đã hết hạn. Vui lòng unlock lại.', 'error');
        return;
      }
      if (!res.ok) throw new Error();
      const payload = await res.json().catch(() => ({}));
      if (payload?.fileWarning && typeof payload.fileWarning === 'string') {
        addToast('Đã lưu thành công lên cloud.', 'success');
        addToast(payload.fileWarning, 'info');
      } else {
        addToast('Đã lưu thành công vào roadmap.json!', 'success');
      }
      const latestVersion = await fetchRoadmapVersion();
      if (latestVersion) {
        currentVersionRef.current = latestVersion;
      }
      setPendingRemoteVersion(null);
      setDismissedVersion(null);
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  }, [addToast, buildDocumentSnapshot, ensureEditor, fetchRoadmapVersion]);


  const handleExportExcelCurrentView = () => {
    if (!data) return;
    try {
      exportRoadmapToExcel(data, {
        mode: 'current-view',
        rows: exportVisibleRows,
        columns: exportVisibleColumns,
        includeSummary: true,
      });
      addToast('Đã xuất Excel (Current View) thành công!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi xuất Excel (Current View).', 'error');
    }
  };

  const handleExportExcelFullData = () => {
    if (!data) return;
    try {
      exportRoadmapToExcel(data, {
        mode: 'full-data',
        includeSummary: false,
      });
      addToast('Đã xuất Excel (Full Data) thành công!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi xuất Excel (Full Data).', 'error');
    }
  };

  const handleNameChange = (name: string) => {
    if (!ensureEditor()) return;
    if (!data) return;
    setData({ ...data, releaseName: name });
  };

  const handleMilestonesSave = (milestones: Milestone[]) => {
    if (!ensureEditor()) return;
    if (!data) return;
    const newData = normalizeDocument({ ...data, milestones });
    setData(newData);
    handleSave(newData);
  };

  const openFilterPopup = useCallback(() => {
    setShowFilterPopup(true);
  }, []);

  const openMilestonesPopup = useCallback(() => {
    setShowMilestones(true);
  }, []);

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
    const toggleValue = (source: string[], value: string): string[] => (
      source.includes(value) ? source.filter(item => item !== value) : [...source, value]
    );

    if (mode === 'feature' || mode === 'improvement' || mode === 'bug') {
      const target = mode === 'feature' ? 'Feature' : mode === 'improvement' ? 'Improvement' : 'Bug';
      setFilterGroupItemType(prev => normalizeGroupItemTypeFilter(toggleValue(prev, target)));
      return;
    }

    if (mode === 'reported') {
      setFilterPriority(prev => normalizePriorityFilterValues(toggleValue(prev, 'Reported')));
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

  const handleDataChange = (newData: RoadmapDocument, shouldSave?: boolean) => {
    if (!isEditor) return;
    const normalized = normalizeDocument(newData);
    setData(normalized);
    if (shouldSave) {
      handleSave(normalized);
    }
  };

  const handleRootAdd = (newItem: RoadmapItem) => {
    if (!ensureEditor()) return;
    if (!data) return;
    setData(normalizeDocument({ ...data, items: [...data.items, newItem] }));
  };

  const handleLoadJson = async (jsonData: unknown) => {
    if (!ensureEditor()) return;
    const parsed = jsonData as Partial<RoadmapDocument> | null;
    if (!parsed || !Array.isArray(parsed.items)) {
      addToast('File JSON không hợp lệ, thiếu `items`', 'error');
      return;
    }
    const yes = await showConfirm('Bạn có chắc chắn muốn ĐÈ BẢN LƯU bằng file JSON vừa tải lên không?');
    if (!yes) return;

    const normalized = normalizeDocument(parsed as RoadmapDocument);
    setData(normalized);
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
        setTimelineMode(settings.timelineMode);
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

  const handleDownloadJson = () => {
    if (!data) return;
    const snapshot = buildDocumentSnapshot(data);
    const fileName = `${snapshot.releaseName.replace(/\s+/g, '_')}_backup_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Đã tải xuống ${fileName}`, 'success');
  };

  // ── Teams extraction ──
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
      const label = (milestone.label || '').trim() || `Phase ${index + 1}`;
      const hasSchedule = !!(normalizeDateValue(milestone.startDate) && normalizeDateValue(milestone.endDate));
      return { id, label, hasSchedule };
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
          onClose={() => setShowMilestones(false)}
        />
      )}

      {showFilterPopup && (
        <FilterPopup
          isOpen={showFilterPopup}
          onClose={() => setShowFilterPopup(false)}
          canEdit={isEditor}
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
        canEdit={isEditor}
        authLoading={authLoading}
        onUnlockEditor={handleUnlockEditor}
        onLockEditor={handleLockEditor}
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
      />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid
          key={isEditor ? 'editor-grid' : 'viewer-grid'}
          data={data}
          onDataChange={handleDataChange}
          onRootAdd={handleRootAdd}
          showConfirm={showConfirm}
          viewStart={viewStart}
          viewEnd={viewEnd}
          timelineMode={timelineMode}
          filterCategory={filterCategory}
          filterStatus={filterStatus}
          filterTeam={filterTeam}
          filterPriority={filterPriority}
          filterPhase={filterPhase}
          filterSubcategory={filterSubcategory}
          filterGroupItemType={filterGroupItemType}
          canEdit={isEditor}
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
