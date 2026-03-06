'use client';

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, ImagePlus, Trash2, X } from 'lucide-react';
import {
    ItemImage,
    ItemStatus,
    RoadmapItem,
    StatusMode,
    SubcategoryType,
    TeamRole,
    TEAM_ROLES,
    STATUS_OPTIONS,
    normalizeItemImages,
    normalizeItemStatus,
    toLegacyImageFields,
} from '@/types/roadmap';
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
const MAX_UPLOAD_IMAGE_COUNT = 10;

const normalizeLocalImages = (images: ItemImage[]): ItemImage[] => {
    return images.reduce<ItemImage[]>((result, image) => {
        const id = image.id.trim();
        const url = image.url.trim();
        if (!id || !url) return result;
        const name = image.name?.trim();
        result.push({
            id,
            url,
            name: name || undefined,
            provider: image.provider,
            updatedAt: image.updatedAt,
        });
        return result;
    }, []);
};

export default function EditPopup({ item, onSave, onClose }: EditPopupProps) {
    const hasChildren = !!(item.children && item.children.length > 0);
    const initialStatusMode: StatusMode = hasChildren ? (item.statusMode ?? 'auto') : 'manual';
    const initialImages = useMemo(() => normalizeItemImages(item), [item]);
    const initialImageIdSet = useMemo(() => new Set(initialImages.map((image) => image.id)), [initialImages]);

    const [name, setName] = useState(item.name);
    const [statusMode, setStatusMode] = useState<StatusMode>(initialStatusMode);
    const [status, setStatus] = useState<ItemStatus>(normalizeItemStatus(item.manualStatus ?? item.status));
    const [progress, setProgress] = useState(item.progress ?? 0);
    const [startDate, setStartDate] = useState(item.startDate || '');
    const [endDate, setEndDate] = useState(item.endDate || '');
    const [quickNote, setQuickNote] = useState(item.quickNote || '');
    const [subcategoryType, setSubcategoryType] = useState<SubcategoryType | undefined>(item.subcategoryType);
    const [images, setImages] = useState<ItemImage[]>(initialImages);
    const [selectedImageIndex, setSelectedImageIndex] = useState(initialImages.length > 0 ? 0 : -1);
    const [removedExistingImageIds, setRemovedExistingImageIds] = useState<Set<string>>(new Set());
    const [newUploadedImageIds, setNewUploadedImageIds] = useState<Set<string>>(new Set());
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedImage = selectedImageIndex >= 0 ? images[selectedImageIndex] : null;

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

    useEffect(() => {
        if (images.length === 0) {
            if (selectedImageIndex !== -1) setSelectedImageIndex(-1);
            if (isImagePreviewOpen) setIsImagePreviewOpen(false);
            return;
        }
        if (selectedImageIndex < 0 || selectedImageIndex >= images.length) {
            setSelectedImageIndex(0);
        }
    }, [images, selectedImageIndex, isImagePreviewOpen]);

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

    const cleanupUnsavedNewImages = async (): Promise<void> => {
        const targets = images.filter(image => newUploadedImageIds.has(image.id));
        if (targets.length === 0) return;
        await Promise.allSettled(targets.map(image => deleteImageById(image.id)));
    };

    const handlePickImage = () => {
        if (isUploadingImage) return;
        setImageError(null);
        fileInputRef.current?.click();
    };

    const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;

        const availableSlots = MAX_UPLOAD_IMAGE_COUNT - images.length;
        if (availableSlots <= 0) {
            setImageError(`Tối đa ${MAX_UPLOAD_IMAGE_COUNT} ảnh cho mỗi hạng mục.`);
            return;
        }

        const filesToProcess = files.slice(0, availableSlots);
        const droppedByLimit = files.length - filesToProcess.length;
        const errors: string[] = [];
        const uploaded: ItemImage[] = [];

        setIsUploadingImage(true);
        setImageError(null);

        for (const file of filesToProcess) {
            if (!file.type.startsWith('image/')) {
                errors.push(`${file.name}: chỉ hỗ trợ file ảnh (jpg, png, webp).`);
                continue;
            }
            if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
                errors.push(`${file.name}: vượt quá ${MAX_UPLOAD_IMAGE_MB}MB.`);
                continue;
            }

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('itemId', item.id);

                const res = await fetch('/api/image/upload', { method: 'POST', body: formData });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Upload ảnh thất bại.');
                }

                const nextImageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl.trim() : '';
                const nextImageId = typeof payload?.imageId === 'string' ? payload.imageId.trim() : '';
                const nextImageName = typeof payload?.imageName === 'string' ? payload.imageName.trim() : file.name;

                if (!nextImageUrl || !nextImageId) {
                    throw new Error('Upload ảnh thất bại: dữ liệu trả về không hợp lệ.');
                }

                uploaded.push({
                    id: nextImageId,
                    url: nextImageUrl,
                    name: nextImageName || undefined,
                    provider: 'cloudinary',
                    updatedAt: new Date().toISOString(),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Upload ảnh thất bại.';
                errors.push(`${file.name}: ${message}`);
            }
        }

        if (uploaded.length > 0) {
            setImages(prev => [...prev, ...uploaded]);
            setNewUploadedImageIds(prev => {
                const next = new Set(prev);
                uploaded.forEach(image => next.add(image.id));
                return next;
            });
            if (selectedImageIndex < 0) setSelectedImageIndex(0);
        }

        if (droppedByLimit > 0) {
            errors.push(`Đã bỏ qua ${droppedByLimit} ảnh do vượt giới hạn ${MAX_UPLOAD_IMAGE_COUNT} ảnh.`);
        }

        setImageError(errors.length > 0 ? errors.join(' ') : null);
        setIsUploadingImage(false);
    };

    const handleSelectImage = (index: number) => {
        setSelectedImageIndex(index);
    };

    const handleRemoveSelectedImage = async () => {
        if (!selectedImage) return;
        const target = selectedImage;
        const targetIndex = selectedImageIndex;

        setImageError(null);
        if (isUploadingImage) return;

        setImages(prev => prev.filter((_, idx) => idx !== targetIndex));

        if (initialImageIdSet.has(target.id)) {
            setRemovedExistingImageIds(prev => {
                const next = new Set(prev);
                next.add(target.id);
                return next;
            });
            return;
        }

        setNewUploadedImageIds(prev => {
            const next = new Set(prev);
            next.delete(target.id);
            return next;
        });

        try {
            await deleteImageById(target.id);
        } catch {
            // Keep UX simple: if cleanup fails, user can still continue editing.
        }
    };

    const handlePrevImage = () => {
        if (images.length <= 1) return;
        setSelectedImageIndex(prev => {
            const safePrev = prev < 0 ? 0 : prev;
            return safePrev === 0 ? images.length - 1 : safePrev - 1;
        });
    };

    const handleNextImage = () => {
        if (images.length <= 1) return;
        setSelectedImageIndex(prev => {
            const safePrev = prev < 0 ? 0 : prev;
            return safePrev === images.length - 1 ? 0 : safePrev + 1;
        });
    };

    const handleCloseWithoutSave = async () => {
        if (isUploadingImage) return;
        try {
            await cleanupUnsavedNewImages();
        } finally {
            onClose();
        }
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
        const normalizedImages = normalizeLocalImages(images);

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
            images: normalizedImages.length > 0 ? normalizedImages : undefined,
            ...toLegacyImageFields(normalizedImages),
            subcategoryType: item.type === 'subcategory' ? subcategoryType : undefined,
            children: updatedChildren
        });

        removedExistingImageIds.forEach((imageId) => {
            void deleteImageById(imageId);
        });

        onClose();
    };

    const hasImagePreview = isImagePreviewOpen && !!selectedImage;

    return (
        <>
            {hasImagePreview && selectedImage && (
                <div className="fixed inset-0 z-[60] bg-black/45 p-4 lg:hidden">
                    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">Image Preview</p>
                                <p className="truncate text-xs text-gray-500">{selectedImage.name || item.name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                {images.length > 1 && (
                                    <>
                                        <button
                                            className="rounded p-1 transition-colors hover:bg-gray-200"
                                            onClick={handlePrevImage}
                                            title="Ảnh trước"
                                        >
                                            <ChevronLeft size={15} className="text-gray-500" />
                                        </button>
                                        <button
                                            className="rounded p-1 transition-colors hover:bg-gray-200"
                                            onClick={handleNextImage}
                                            title="Ảnh kế"
                                        >
                                            <ChevronRight size={15} className="text-gray-500" />
                                        </button>
                                    </>
                                )}
                                <button
                                    className="rounded p-1 transition-colors hover:bg-gray-200"
                                    onClick={() => setIsImagePreviewOpen(false)}
                                    title="Đóng preview"
                                >
                                    <X size={16} className="text-gray-500" />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
                            <img
                                src={selectedImage.url}
                                alt={selectedImage.name || item.name}
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
                beforePanel={hasImagePreview && selectedImage ? (
                    <aside className="hidden h-full min-w-[280px] w-[360px] max-w-[32vw] flex-col border-l border-r border-gray-200 bg-white shadow-2xl lg:flex">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800">Image Preview</p>
                                <p className="truncate text-xs text-gray-500">{selectedImage.name || item.name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                {images.length > 1 && (
                                    <>
                                        <button
                                            className="rounded p-1 transition-colors hover:bg-gray-200"
                                            onClick={handlePrevImage}
                                            title="Ảnh trước"
                                        >
                                            <ChevronLeft size={15} className="text-gray-500" />
                                        </button>
                                        <button
                                            className="rounded p-1 transition-colors hover:bg-gray-200"
                                            onClick={handleNextImage}
                                            title="Ảnh kế"
                                        >
                                            <ChevronRight size={15} className="text-gray-500" />
                                        </button>
                                    </>
                                )}
                                <button
                                    className="rounded p-1 transition-colors hover:bg-gray-200"
                                    onClick={() => setIsImagePreviewOpen(false)}
                                    title="Đóng preview"
                                >
                                    <X size={16} className="text-gray-500" />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
                            <img
                                src={selectedImage.url}
                                alt={selectedImage.name || item.name}
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
                                multiple
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="hidden"
                                onChange={handleUploadImage}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePickImage}
                                    disabled={isUploadingImage || images.length >= MAX_UPLOAD_IMAGE_COUNT}
                                    className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                >
                                    <ImagePlus size={12} />
                                    {isUploadingImage ? 'Đang upload...' : 'Upload ảnh'}
                                </button>
                                {selectedImage && (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                        onClick={() => { void handleRemoveSelectedImage(); }}
                                        disabled={isUploadingImage}
                                    >
                                        <Trash2 size={12} />
                                        Xóa ảnh
                                    </button>
                                )}
                                {selectedImage && (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                        onClick={() => setIsImagePreviewOpen(true)}
                                    >
                                        <Eye size={12} />
                                        Xem preview
                                    </button>
                                )}
                                <span className="ml-auto text-[10px] font-semibold text-gray-500">{images.length}/{MAX_UPLOAD_IMAGE_COUNT}</span>
                            </div>
                            {images.length > 0 && (
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                    {images.map((image, index) => (
                                        <div
                                            key={image.id}
                                            className={`relative overflow-hidden rounded border ${selectedImageIndex === index ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}`}
                                        >
                                            <button
                                                type="button"
                                                className="w-full text-left"
                                                onClick={() => handleSelectImage(index)}
                                                title={image.name || `Ảnh ${index + 1}`}
                                            >
                                                <img
                                                    src={image.url}
                                                    alt={image.name || `Ảnh ${index + 1}`}
                                                    className="h-16 w-full border-b border-gray-100 bg-white object-cover"
                                                />
                                                <p className="px-1 py-0.5 text-[10px] text-gray-500 truncate">{image.name || `Ảnh ${index + 1}`}</p>
                                            </button>
                                        </div>
                                    ))}
                                </div>
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
