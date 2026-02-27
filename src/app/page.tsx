'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { startOfDay, subWeeks, addMonths, endOfMonth, format } from 'date-fns';
import Toolbar from '@/components/Toolbar';
import SpreadsheetGrid from '@/components/SpreadsheetGrid';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import MilestoneEditor from '@/components/MilestoneEditor';
import { useToast } from '@/hooks/useToast';
import { RoadmapDocument, RoadmapItem, Milestone } from '@/types/roadmap';
import { exportRoadmapToExcel } from '@/utils/exportToExcel';

export default function Home() {
  const [data, setData] = useState<RoadmapDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);

  // Timeline window: how many weeks before & months after today
  const [beforeWeeks, setBeforeWeeks] = useState(2);
  const [afterMonths, setAfterMonths] = useState(2);

  const { toasts, addToast, removeToast } = useToast();

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
        setData(json);
        if (json.settings) {
          if (typeof json.settings.beforeWeeks === 'number') setBeforeWeeks(json.settings.beforeWeeks);
          if (typeof json.settings.afterMonths === 'number') setAfterMonths(json.settings.afterMonths);
        }
        setLoading(false);
      })
      .catch(() => addToast('Không thể tải dữ liệu roadmap.json', 'error'));
  }, []);

  const handleSave = async (currentData: RoadmapDocument) => {
    setSaving(true);
    try {
      const dataToSave = {
        ...currentData,
        settings: { beforeWeeks, afterMonths }
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
    setData({ ...data, milestones });
  };

  const handleDataChange = (newData: RoadmapDocument) => setData(newData);

  const handleRootAdd = (newItem: RoadmapItem) => {
    if (!data) return;
    setData({ ...data, items: [...data.items, newItem] });
  };

  const handleLoadJson = async (jsonData: any) => {
    if (!jsonData || !jsonData.items) {
      addToast('File JSON không hợp lệ, thiếu `items`', 'error');
      return;
    }
    const yes = await showConfirm('Bạn có chắc chắn muốn ĐÈ BẢN LƯU bằng file JSON vừa tải lên không?');
    if (!yes) return;

    setData(jsonData);
    if (jsonData.settings) {
      if (typeof jsonData.settings.beforeWeeks === 'number') setBeforeWeeks(jsonData.settings.beforeWeeks);
      if (typeof jsonData.settings.afterMonths === 'number') setAfterMonths(jsonData.settings.afterMonths);
    }
    await handleSave(jsonData);
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
      />
      <div className="flex-1 overflow-hidden">
        <SpreadsheetGrid
          data={data}
          onDataChange={handleDataChange}
          onRootAdd={handleRootAdd}
          showConfirm={showConfirm}
          viewStart={viewStart}
          viewEnd={viewEnd}
        />
      </div>
    </main>
  );
}
