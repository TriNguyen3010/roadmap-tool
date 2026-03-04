'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
import Toolbar from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import MilestoneEditor from '@/components/MilestoneEditor';
import { useToast } from '@/hooks/useToast';
import { RoadmapDocument, RoadmapItem, Milestone } from '@/types/roadmap';
import { exportRoadmapToExcel } from '@/utils/exportToExcel';
import { recalculateRoadmap } from '@/utils/roadmapHelpers';

export default function Home() {
  const [data, setData] = useState<RoadmapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);

  // Timeline window: how many weeks before & months after today
  const [beforeWeeks, setBeforeWeeks] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  // View settings
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTeam, setFilterTeam] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);

  // Column visibility
  const [showPct, setShowPct] = useState(true);
  const [showPriority, setShowPriority] = useState(true);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);

  // Row visibility & expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
  // This ref ensures we only auto-expand once on initial load if no saved state exists
  const hasInitializedExpansion = useRef(false);

  const { toasts, addToast, removeToast } = useToast();

  const normalizeDocument = useCallback((doc: RoadmapDocument): RoadmapDocument => ({
    ...doc,
    items: recalculateRoadmap(doc.items || []),
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
          if (json.settings.filterStatus) setFilterStatus(json.settings.filterStatus);
          if (json.settings.filterTeam) setFilterTeam(json.settings.filterTeam);
          if (json.settings.filterPriority) setFilterPriority(json.settings.filterPriority);
          if (json.settings.filterSubcategory) setFilterSubcategory(json.settings.filterSubcategory);
          if (typeof json.settings.colPct === 'boolean') setShowPct(json.settings.colPct);
          if (typeof json.settings.colPriority === 'boolean') setShowPriority(json.settings.colPriority);
          if (typeof json.settings.colStartDate === 'boolean') setShowStartDate(json.settings.colStartDate);
          if (typeof json.settings.colEndDate === 'boolean') setShowEndDate(json.settings.colEndDate);
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

  const handleSave = async (currentData: RoadmapDocument) => {
    setSaving(true);
    try {
      const dataToSave = {
        ...currentData,
        settings: {
          beforeWeeks, afterMonths,
          filterStatus, filterTeam, filterPriority,
          filterSubcategory,
          colPct: showPct, colPriority: showPriority,
          colStartDate: showStartDate, colEndDate: showEndDate,
          expandedIds: Array.from(expandedIds),
          hiddenRowIds: Array.from(hiddenRowIds),
        }
      };

      const res = await fetch('/api/roadmap/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      if (!res.ok) throw new Error();
      addToast('Đã lưu thành công vào roadmap.json!', 'success');
    } catch {
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  };


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
    if (!data) return;
    setData({ ...data, releaseName: name });
  };

  const handleMilestonesSave = (milestones: Milestone[]) => {
    if (!data) return;
    const newData = normalizeDocument({ ...data, milestones });
    setData(newData);
    handleSave(newData);
  };

  const handleDataChange = (newData: RoadmapDocument, shouldSave?: boolean) => {
    const normalized = normalizeDocument(newData);
    setData(normalized);
    if (shouldSave) {
      handleSave(normalized);
    }
  };

  const handleRootAdd = (newItem: RoadmapItem) => {
    if (!data) return;
    setData(normalizeDocument({ ...data, items: [...data.items, newItem] }));
  };

  const handleLoadJson = async (jsonData: unknown) => {
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
      if (parsed.settings.filterStatus) setFilterStatus(parsed.settings.filterStatus);
      if (parsed.settings.filterTeam) setFilterTeam(parsed.settings.filterTeam);
      if (parsed.settings.filterPriority) setFilterPriority(parsed.settings.filterPriority);
      if (parsed.settings.filterSubcategory) setFilterSubcategory(parsed.settings.filterSubcategory);
    }
    await handleSave(normalized);
  };

  const handleDownloadJson = () => {
    if (!data) return;
    const fileName = `${data.releaseName.replace(/\s+/g, '_')}_backup_${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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

      <Toolbar
        documentName={data.releaseName}
        onNameChange={handleNameChange}
        onSave={() => handleSave(data)}
        onExportExcel={handleExportExcel}
        onDownloadJson={handleDownloadJson}
        onOpenMilestones={() => setShowMilestones(true)}
        beforeWeeks={beforeWeeks}
        afterMonths={afterMonths}
        onBeforeWeeksChange={setBeforeWeeks}
        onAfterMonthsChange={setAfterMonths}
        onLoadJson={handleLoadJson}
        isSaving={saving}
        availableTeams={availableTeams}
        availableSubcategories={availableSubcategories}
        filterStatus={filterStatus}
        filterTeam={filterTeam}
        filterPriority={filterPriority}
        filterSubcategory={filterSubcategory}
        onFilterChange={(type, values) => {
          if (type === 'status') setFilterStatus(values);
          else if (type === 'team') setFilterTeam(values);
          else if (type === 'priority') setFilterPriority(values);
          else if (type === 'subcategory') setFilterSubcategory(values);
        }}
        onSaveView={() => handleSave({
          ...data, settings: {
            beforeWeeks, afterMonths, filterStatus, filterTeam, filterPriority, filterSubcategory,
            colPct: showPct, colPriority: showPriority, colStartDate: showStartDate, colEndDate: showEndDate,
            expandedIds: Array.from(expandedIds), hiddenRowIds: Array.from(hiddenRowIds)
          }
        })}
      />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid
          data={data}
          onDataChange={handleDataChange}
          onRootAdd={handleRootAdd}
          showConfirm={showConfirm}
          viewStart={viewStart}
          viewEnd={viewEnd}
          filterStatus={filterStatus}
          filterTeam={filterTeam}
          filterPriority={filterPriority}
          filterSubcategory={filterSubcategory}
          showPct={showPct} setShowPct={setShowPct}
          showPriority={showPriority} setShowPriority={setShowPriority}
          showStartDate={showStartDate} setShowStartDate={setShowStartDate}
          showEndDate={showEndDate} setShowEndDate={setShowEndDate}
          today={today}
          expandedIds={expandedIds} setExpandedIds={setExpandedIds}
          hiddenRowIds={hiddenRowIds} setHiddenRowIds={setHiddenRowIds}
        />
      </div>
    </main>
  );
}
