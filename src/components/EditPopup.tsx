'use client';

import { type ChangeEvent, useRef, useState } from 'react';
import { Eye, ImagePlus, Trash2, X } from 'lucide-react';
import { RoadmapItem, ItemStatus, StatusMode, SubcategoryType, TeamRole, TEAM_ROLES, STATUS_OPTIONS, normalizeItemStatus } from '@/types/roadmap';
import { v4 as uuidv4 } from 'uuid';
import SidePanelShell from './SidePanelShell';

interface EditPopupProps {
    item: RoadmapItem;
    onSave: (updated: RoadmapItem) => void;
    onClose: () => void;
}

const SUBCATEGORY_TYPES: SubcategoryType[] = ['Feature', 'Bug', 'Growth Camp'];

const SUB_TYPE_STYLE: Record<SubcategoryType, { bg: string; text: string; border: string }> = {
    'Feature': { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    'Bug': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
    'Growth Camp': { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
};
const MAX_QUICK_NOTE_LENGTH = 500;
const MAX_UPLOAD_IMAGE_MB = 5;
const MAX_UPLOAD_IMAGE_BYTES = MAX_UPLOAD_IMAGE_MB * 1024 * 1024;

export default function EditPopup({ item, onSave, onClose }: EditPopupProps) {
    const hasChildren = !!(item.children && item.children.length > 0);
    const initialStatusMode: StatusMode = hasChildren ? (item.statusMode ?? 'auto') : 'manual';

    const [name, setName] = useState(item.name);
    const [statusMode, setStatusMode] = useState<StatusMode>(initialStatusMode);
    const [status, setStatus] = useState<ItemStatus>(normalizeItemStatus(item.manualStatus ?? item.status));
    const [progress, setProgress] = useState(item.progress ?? 0);
    const [startDate, setStartDate] = useState(item.startDate || '');
    const [endDate, setEndDate] = useState(item.endDate || '');
    const [quickNote, setQuickNote] = useState(item.quickNote || '');
    const [subcategoryType, setSubcategoryType] = useState<SubcategoryType | undefined>(item.subcategoryType);
    const [imageUrl, setImageUrl] = useState(item.imageUrl || '');
    const [imageId, setImageId] = useState(item.imageId || '');
    const [imageName, setImageName] = useState(item.imageName || '');
    const [imageProvider, setImageProvider] = useState<'cloudinary' | undefined>(item.imageProvider);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dates/progress are locked when item has children that are NOT all teams
    const hasNonTeamChildren = !!(item.children && item.children.some(c => c.type !== 'team'));
    const isRolledUp = hasNonTeamChildren;
    const isCategoryManual = item.type === 'category' && statusMode === 'manual';
    const isDateLocked = isRolledUp && !isCategoryManual;

    // Initialize selectedTeams based on existing children that are of type 'team'
    const [selectedTeams, setSelectedTeams] = useState<Set<TeamRole>>(() => {
        const set = new Set<TeamRole>();
        if ((item.type === 'feature' || item.type === 'group') && item.children) {
            item.children.forEach(child => {
                if (child.type === 'team' && child.teamRole) set.add(child.teamRole);
            });
        }
        return set;
    });

    const handleStatusChange = (s: ItemStatus) => {
        setStatus(s);
        if (s === 'Done') setProgress(100);
        if (s === 'Not Started') setProgress(0);
    };

    const handleProgressChange = (v: number) => {
        setProgress(v);
        if (statusMode === 'manual') {
            if (v === 100) setStatus('Done');
            else if (v === 0) setStatus('Not Started');
            else setStatus('Dev In Progress');
        }
    };

    const toggleTeam = (role: TeamRole) => {
        const next = new Set(selectedTeams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        setSelectedTeams(next);
    };

    const deleteImageById = async (targetImageId: string): Promise<void> => {
        if (!targetImageId) return;
        await fetch('/api/image/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: targetImageId }),
        });
    };

    const handlePickImage = () => {
        if (isUploadingImage) return;
        setImageError(null);
        fileInputRef.current?.click();
    };

    const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setImageError('Chỉ hỗ trợ file ảnh (jpg, png, webp).');
            return;
        }

        if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
            setImageError(`Ảnh vượt quá ${MAX_UPLOAD_IMAGE_MB}MB.`);
            return;
        }

        setIsUploadingImage(true);
        setImageError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('itemId', item.id);

            const res = await fetch('/api/image/upload', { method: 'POST', body: formData });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'Upload ảnh thất bại.');
            }

            const nextImageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : '';
            const nextImageId = typeof payload?.imageId === 'string' ? payload.imageId : '';
            const nextImageName = typeof payload?.imageName === 'string' ? payload.imageName : file.name;

            if (!nextImageUrl || !nextImageId) {
                throw new Error('Upload ảnh thất bại: dữ liệu trả về không hợp lệ.');
            }

            if (imageId && imageId !== (item.imageId || '') && imageId !== nextImageId) {
                void deleteImageById(imageId);
            }

            setImageUrl(nextImageUrl);
            setImageId(nextImageId);
            setImageName(nextImageName);
            setImageProvider('cloudinary');
            setImageError(null);
        } catch (error) {
            setImageError(error instanceof Error ? error.message : 'Upload ảnh thất bại.');
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleRemoveImage = async () => {
        setImageError(null);
        if (isUploadingImage) return;

        if (imageId && imageId !== (item.imageId || '')) {
            try {
                await deleteImageById(imageId);
            } catch {
                // Keep UX simple: if cleanup fails, user can still continue editing.
            }
        }

        setImageUrl('');
        setImageId('');
        setImageName('');
        setImageProvider(undefined);
        setIsImagePreviewOpen(false);
    };

    const handleCloseWithoutSave = () => {
        if (imageId && imageId !== (item.imageId || '')) {
            void deleteImageById(imageId);
        }
        onClose();
    };

    const handlePanelClose = () => {
        if (isImagePreviewOpen) {
            setIsImagePreviewOpen(false);
            return;
        }
        void handleCloseWithoutSave();
    };

    const handleSubmit = () => {
        let updatedChildren = item.children;
        const normalizedQuickNote = quickNote.trim();
        const nextImageUrl = imageUrl.trim();
        const nextImageId = imageId.trim();
        const nextImageName = imageName.trim();
        const previousImageId = item.imageId || '';
        const hasImageChanged = (item.imageUrl || '') !== nextImageUrl || previousImageId !== nextImageId;

        if (item.type === 'feature' || item.type === 'group') {
            const currentTeamsMap = new Map<TeamRole, RoadmapItem>();
            if (item.children) {
                item.children.forEach(child => {
                    if (child.type === 'team' && child.teamRole) {
                        currentTeamsMap.set(child.teamRole, child);
                    }
                });
            }

            const newChildren: RoadmapItem[] = item.children
                ? item.children.filter(child => child.type !== 'team')
                : [];

            selectedTeams.forEach(role => {
                if (currentTeamsMap.has(role)) {
                    newChildren.push(currentTeamsMap.get(role)!);
                } else {
                    newChildren.push({
                        id: uuidv4().slice(0, 8),
                        name: role,
                        type: 'team',
                        teamRole: role,
                        status: 'Not Started',
                        statusMode: 'manual',
                        manualStatus: 'Not Started',
                        progress: 0,
                        startDate: startDate || undefined,
                        endDate: endDate || undefined
                    });
                }
            });
            updatedChildren = newChildren;
        }

        const hasChildrenAfterUpdate = !!(updatedChildren && updatedChildren.length > 0);
        const nextStatusMode: StatusMode = hasChildrenAfterUpdate ? statusMode : 'manual';

        onSave({
            ...item,
            name,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            status: nextStatusMode === 'manual' ? status : item.status,
            statusMode: nextStatusMode,
            manualStatus: nextStatusMode === 'manual' ? status : undefined,
            progress,
            quickNote: normalizedQuickNote.length > 0 ? normalizedQuickNote : undefined,
            imageUrl: nextImageUrl || undefined,
            imageId: nextImageId || undefined,
            imageName: nextImageName || undefined,
            imageProvider: nextImageId ? (imageProvider || 'cloudinary') : undefined,
            imageUpdatedAt: nextImageUrl ? (hasImageChanged ? new Date().toISOString() : item.imageUpdatedAt) : undefined,
            subcategoryType: item.type === 'subcategory' ? subcategoryType : undefined,
            children: updatedChildren
        });
        if (previousImageId && previousImageId !== nextImageId) {
            void deleteImageById(previousImageId);
        }
        onClose();
    };

    const hasImagePreview = isImagePreviewOpen && !!imageUrl;

    return (
        <>
            {hasImagePreview && (
                <div className="fixed inset-0 z-[60] bg-black/45 p-4 lg:hidden">
                    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">Image Preview</p>
                                <p className="truncate text-xs text-gray-500">{imageName || item.name}</p>
                            </div>
                            <button
                                className="rounded p-1 transition-colors hover:bg-gray-200"
                                onClick={() => setIsImagePreviewOpen(false)}
                                title="Đóng preview"
                            >
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
                            <img
                                src={imageUrl}
                                alt={imageName || item.name}
                                className="max-h-full max-w-full rounded border border-gray-200 bg-white object-contain shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            <SidePanelShell
                isOpen
                onClose={handlePanelClose}
                title="Chỉnh sửa hạng mục"
                subtitle={`Loại: ${item.type}`}
                widthClassName="w-[92vw] max-w-[520px]"
                scrollMode="panel"
                beforePanel={hasImagePreview ? (
                    <aside className="hidden h-full min-w-[280px] w-[360px] max-w-[32vw] flex-col border-l border-r border-gray-200 bg-white shadow-2xl lg:flex">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">Image Preview</p>
                                <p className="truncate text-xs text-gray-500">{imageName || item.name}</p>
                            </div>
                            <button
                                className="rounded p-1 transition-colors hover:bg-gray-200"
                                onClick={() => setIsImagePreviewOpen(false)}
                                title="Đóng preview"
                            >
                                <X size={16} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
                            <img
                                src={imageUrl}
                                alt={imageName || item.name}
                                className="max-h-full max-w-full rounded border border-gray-200 bg-white object-contain shadow-sm"
                            />
                        </div>
                    </aside>
                ) : undefined}
                footer={(
                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-gray-200 bg-white p-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="hidden"
                                onChange={handleUploadImage}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePickImage}
                                    disabled={isUploadingImage}
                                    className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                >
                                    <ImagePlus size={12} />
                                    {isUploadingImage ? 'Đang upload...' : imageUrl ? 'Đổi ảnh' : 'Upload ảnh'}
                                </button>
                                {imageUrl && (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                        onClick={() => { void handleRemoveImage(); }}
                                        disabled={isUploadingImage}
                                    >
                                        <Trash2 size={12} />
                                        Xóa ảnh
                                    </button>
                                )}
                                {imageUrl && (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                        onClick={() => setIsImagePreviewOpen(true)}
                                    >
                                        <Eye size={12} />
                                        Xem preview
                                    </button>
                                )}
                            </div>
                            {imageUrl && (
                                <button
                                    type="button"
                                    className="mt-2 w-full rounded border border-gray-200 bg-gray-50 p-1.5 text-left hover:bg-gray-100 transition-colors"
                                    onClick={() => setIsImagePreviewOpen(true)}
                                    title="Mở preview kế bên"
                                >
                                    <img
                                        src={imageUrl}
                                        alt={imageName || item.name}
                                        className="h-16 w-full rounded object-cover border border-gray-200 bg-white"
                                    />
                                    <p className="mt-1 text-[10px] text-gray-500 truncate">{imageName || item.name}</p>
                                </button>
                            )}
                            {imageError && <p className="mt-2 text-[11px] text-red-600">{imageError}</p>}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => { void handleCloseWithoutSave(); }}
                                className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100"
                                disabled={isUploadingImage}
                            >
                                Huỷ
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-300"
                                disabled={isUploadingImage}
                            >
                                Lưu
                            </button>
                        </div>
                    </div>
                )}
            >
                <div className="flex flex-col gap-4">

                {/* Subcategory Type (only for subcategory items) */}
                {item.type === 'subcategory' && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600">Loại</label>
                        <div className="flex gap-2">
                            {SUBCATEGORY_TYPES.map(t => {
                                const s = SUB_TYPE_STYLE[t];
                                const isSelected = subcategoryType === t;
                                return (
                                    <button
                                        key={t}
                                        onClick={() => setSubcategoryType(isSelected ? undefined : t)}
                                        className="px-3 py-1 rounded-full text-xs font-bold border-2 transition-all"
                                        style={{
                                            backgroundColor: isSelected ? s.bg : '#f9fafb',
                                            color: isSelected ? s.text : '#9ca3af',
                                            borderColor: isSelected ? s.border : '#e5e7eb',
                                        }}
                                    >
                                        {t}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Name */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Tên</label>
                    {item.type === 'team' ? (
                        <div className="border border-gray-200 bg-gray-50 rounded px-2 py-1.5 text-sm text-gray-700 font-medium">
                            {item.teamRole}
                        </div>
                    ) : (
                        <input
                            autoFocus
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    )}
                </div>

                {/* Quick note */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-600">Quick note (Optional)</label>
                        <span className="text-[10px] text-gray-400">{quickNote.length}/{MAX_QUICK_NOTE_LENGTH}</span>
                    </div>
                    <textarea
                        rows={4}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                        value={quickNote}
                        onChange={(e) => setQuickNote(e.target.value.slice(0, MAX_QUICK_NOTE_LENGTH))}
                        placeholder="Ghi chú nhanh để xem lại sau..."
                    />
                </div>

                {/* Teams */}
                {(item.type === 'feature' || item.type === 'group') && (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600">Teams (Optional)</label>
                        <div className="flex flex-wrap gap-2">
                            {TEAM_ROLES.map(role => {
                                const isSelected = selectedTeams.has(role);
                                return (
                                    <label key={role} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleTeam(role)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className={isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}>{role}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Auto rollup notice */}
                {isDateLocked && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                        Thời gian và tiến độ được tự động tính toán từ các mục con.
                    </div>
                )}
                {isCategoryManual && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                        Category đang ở chế độ manual: bạn có thể chỉnh ngày bắt đầu/kết thúc.
                    </div>
                )}

                {/* Start / End Date */}
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày bắt đầu</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={isDateLocked}
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs font-semibold text-gray-600">Ngày kết thúc</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            disabled={isDateLocked}
                        />
                    </div>
                </div>

                {/* Status */}
                {hasChildren && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-gray-600">Cách tính trạng thái</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setStatusMode('auto')}
                                className={`rounded border px-2 py-1.5 text-sm font-semibold transition-colors ${statusMode === 'auto'
                                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                Auto từ task con
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusMode('manual')}
                                className={`rounded border px-2 py-1.5 text-sm font-semibold transition-colors ${statusMode === 'manual'
                                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                Manual
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">Trạng thái</label>
                    <select
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
                        value={statusMode === 'manual' ? status : normalizeItemStatus(item.status)}
                        onChange={(e) => handleStatusChange(e.target.value as ItemStatus)}
                        disabled={statusMode === 'auto'}
                    >
                        {STATUS_OPTIONS.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                    {statusMode === 'auto' && (
                        <p className="text-[11px] text-gray-500">Status đang tự động theo task con.</p>
                    )}
                </div>

                {/* Progress */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">
                        Tiến độ: <span className="text-blue-600 font-bold">{progress}%</span>
                    </label>
                    <input
                        type="range" min={0} max={100} step={5} value={progress}
                        onChange={(e) => handleProgressChange(Number(e.target.value))}
                        className="w-full accent-blue-500 disabled:opacity-50"
                        disabled={isRolledUp}
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>

                </div>
            </SidePanelShell>
        </>
    );
}
