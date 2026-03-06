'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
import Toolbar from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import MilestoneEditor from '@/components/MilestoneEditor';
import FilterPopup from '@/components/FilterPopup';
import TimelineModeFab from '@/components/TimelineModeFab';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { RoadmapDocument, RoadmapItem, Milestone, ColumnWidthMode, TimelineMode, normalizeItemPriority, normalizePriorityFilterValues, normalizeStatusFilter } from '@/types/roadmap';
import { exportRoadmapToExcel } from '@/utils/exportToExcel';
import { recalculateRoadmap } from '@/utils/roadmapHelpers';

const DEFAULT_FEATURES_COL_WIDTH = 260;
const MIN_FEATURES_COL_WIDTH = 120;
const MAX_FEATURES_COL_WIDTH = 450;
const DEFAULT_TIMELINE_MODE: TimelineMode = 'day';

function clampFeaturesColWidth(width: number): number {
  return Math.max(MIN_FEATURES_COL_WIDTH, Math.min(MAX_FEATURES_COL_WIDTH, width));
}

function normalizePriorityTree(items: RoadmapItem[]): RoadmapItem[] {
  return items.map(item => ({
    ...item,
    priority: normalizeItemPriority(item.priority),
    children: item.children ? normalizePriorityTree(item.children) : item.children,
  }));
}

export default function Home() {
  const [data, setData] = useState<RoadmapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Timeline window: how many weeks before & months after today
  const [beforeWeeks, setBeforeWeeks] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  // View settings
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);

  // Column visibility
  const [showPct, setShowPct] = useState(true);
  const [showPriority, setShowPriority] = useState(true);
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
    settings: doc.settings
      ? { ...doc.settings, filterPriority: normalizePriorityFilterValues(doc.settings.filterPriority) }
      : doc.settings,
    items: recalculateRoadmap(normalizePriorityTree(doc.items || [])),
  }), []);

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
    fetch('/api/roadmap')
      .then(res => res.json())
      .then(json => {
        const normalized = normalizeDocument(json);
        setData(normalized);
        if (json.settings) {
          if (typeof json.settings.beforeWeeks === 'number') setBeforeWeeks(json.settings.beforeWeeks);
          if (typeof json.settings.afterMonths === 'number') setAfterMonths(json.settings.afterMonths);
          if (json.settings.filterCategory) setFilterCategory(json.settings.filterCategory);
          if (json.settings.filterStatus) setFilterStatus(normalizeStatusFilter(json.settings.filterStatus));
          if (json.settings.filterTeam) setFilterTeam(json.settings.filterTeam);
          if (json.settings.filterPriority) setFilterPriority(normalizePriorityFilterValues(json.settings.filterPriority));
          if (json.settings.filterSubcategory) setFilterSubcategory(json.settings.filterSubcategory);
          if (typeof json.settings.colPct === 'boolean') setShowPct(json.settings.colPct);
          if (typeof json.settings.colPriority === 'boolean') setShowPriority(json.settings.colPriority);
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

        setLoading(false);
      })
      .catch(() => addToast('Không thể tải dữ liệu roadmap.json', 'error'));
  }, [addToast, normalizeDocument]);

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
      filterSubcategory,
      colPct: showPct,
      colPriority: showPriority,
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
    filterSubcategory,
    showPct,
    showPriority,
    showStartDate,
    showEndDate,
    featuresColWidth,
    featuresColWidthMode,
    timelineMode,
    expandedIds,
    hiddenRowIds,
  ]);

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
      addToast('Đã lưu thành công vào roadmap.json!', 'success');
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  }, [addToast, buildDocumentSnapshot, ensureEditor]);


  const handleExportExcel = () => {
    if (!data) return;
    try {
      exportRoadmapToExcel(data);
      addToast('Đã xuất Excel thành công!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Lỗi khi xuất Excel.', 'error');
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

  const handleFilterChange = useCallback((type: 'category' | 'status' | 'team' | 'priority' | 'subcategory', values: string[]) => {
    if (type === 'category') setFilterCategory(values);
    else if (type === 'status') setFilterStatus(values);
    else if (type === 'team') setFilterTeam(values);
    else if (type === 'priority') setFilterPriority(normalizePriorityFilterValues(values));
    else if (type === 'subcategory') setFilterSubcategory(values);
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
      if (typeof parsed.settings.beforeWeeks === 'number') setBeforeWeeks(parsed.settings.beforeWeeks);
      if (typeof parsed.settings.afterMonths === 'number') setAfterMonths(parsed.settings.afterMonths);
      if (parsed.settings.filterCategory) setFilterCategory(parsed.settings.filterCategory);
      if (parsed.settings.filterStatus) setFilterStatus(normalizeStatusFilter(parsed.settings.filterStatus));
      if (parsed.settings.filterTeam) setFilterTeam(parsed.settings.filterTeam);
      if (parsed.settings.filterPriority) setFilterPriority(normalizePriorityFilterValues(parsed.settings.filterPriority));
      if (parsed.settings.filterSubcategory) setFilterSubcategory(parsed.settings.filterSubcategory);
      if (typeof parsed.settings.colFeaturesWidth === 'number') {
        setFeaturesColWidth(clampFeaturesColWidth(parsed.settings.colFeaturesWidth));
      }
      if (parsed.settings.colFeaturesWidthMode === 'auto' || parsed.settings.colFeaturesWidthMode === 'manual') {
        setFeaturesColWidthMode(parsed.settings.colFeaturesWidthMode);
      } else if (typeof parsed.settings.colFeaturesWidth === 'number') {
        setFeaturesColWidthMode('manual');
      }
      if (parsed.settings.timelineMode === 'day' || parsed.settings.timelineMode === 'week' || parsed.settings.timelineMode === 'month') {
        setTimelineMode(parsed.settings.timelineMode);
      }
    }
    await handleSave(normalized);
  };

  const handleDownloadJson = () => {
    if (!data) return;
    const snapshot = buildDocumentSnapshot(data);
    const fileName = `${snapshot.releaseName.replace(/\s+/g, '_')}_backup_${format(new Date(), 'yyyy-MM-dd')}.json`;
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
          filterSubcategory={filterSubcategory}
          onFilterChange={handleFilterChange}
          onSaveView={() => handleSave(data)}
        />
      )}

      <Toolbar
        documentName={data.releaseName}
        onNameChange={handleNameChange}
        onSave={() => handleSave(data)}
        onExportExcel={handleExportExcel}
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
        filterSubcategory={filterSubcategory}
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
          filterSubcategory={filterSubcategory}
          canEdit={isEditor}
          showPct={showPct} setShowPct={setShowPct}
          showPriority={showPriority} setShowPriority={setShowPriority}
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
