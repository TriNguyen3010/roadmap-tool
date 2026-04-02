'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { isAdminLevel } from '@/types/auth';

interface RoadmapMeta {
    id: string;
    name: string;
    updated_at: string | null;
}

export default function HomePage() {
    const router = useRouter();
    const [roadmaps, setRoadmaps] = useState<RoadmapMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { user, loading: authLoading, loginWithGoogle, logout } = useGoogleAuth();
    const canManageRoadmaps = isAdminLevel(user);

    const fetchRoadmaps = useCallback(async () => {
        try {
            const res = await fetch('/api/roadmaps', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setRoadmaps(Array.isArray(data) ? data : []);
        } catch {
            setError('Không thể tải danh sách roadmap.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRoadmaps();
    }, [fetchRoadmaps]);

    const handleCreate = async () => {
        const name = newName.trim() || 'Untitled Roadmap';
        setCreating(true);
        try {
            const res = await fetch('/api/roadmaps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.status === 401) {
                setError('Bạn cần đăng nhập bằng Google để tạo roadmap mới.');
                return;
            }
            if (!res.ok) throw new Error('Create failed');
            const created = await res.json();
            router.push(`/roadmap/${created.id}`);
        } catch {
            setError('Lỗi khi tạo roadmap. Vui lòng thử lại.');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Bạn có chắc chắn muốn xóa "${name}" không? Hành động này không thể hoàn tác.`)) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/roadmap/${id}`, { method: 'DELETE' });
            if (res.status === 401) {
                setError('Bạn cần đăng nhập bằng Google để xóa roadmap.');
                return;
            }
            if (!res.ok) throw new Error('Delete failed');
            setRoadmaps(prev => prev.filter(roadmap => roadmap.id !== id));
        } catch {
            setError('Lỗi khi xóa roadmap. Vui lòng thử lại.');
        } finally {
            setDeletingId(null);
        }
    };

    const formatUpdatedAt = (updatedAt: string | null): string => {
        if (!updatedAt) return 'Chưa cập nhật';
        try {
            return format(new Date(updatedAt), 'dd/MM/yyyy HH:mm', { locale: vi });
        } catch {
            return updatedAt;
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
                Đang tải...
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
                <div className="mx-auto flex max-w-5xl items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src="/images/logo-c98.png"
                            alt="Coin98 Logo"
                            className="h-7 w-7 object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-slate-900">Roadmap Tool</h1>
                            <p className="text-xs text-slate-500">Quan ly tat ca roadmap cua ban</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {user ? (
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div className="flex flex-col leading-none">
                                    <span className="text-sm font-semibold text-slate-700">{user.label}</span>
                                    <span className="text-[11px] text-slate-500">
                                        {canManageRoadmaps ? 'Admin-level' : (user.team || 'Viewer')}
                                    </span>
                                </div>
                                <button
                                    onClick={() => void logout()}
                                    className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => void loginWithGoogle('/')}
                                disabled={authLoading}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                            >
                                {authLoading ? 'Dang xu ly...' : 'Dang nhap Google'}
                            </button>
                        )}

                        {canManageRoadmaps && (
                            <button
                                onClick={() => { setShowCreateForm(true); setNewName(''); setError(null); }}
                                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                            >
                                <span>+</span>
                                <span>Tạo Roadmap mới</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-5xl px-6 py-8">
                {error && (
                    <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                        <p className="text-sm text-red-700">{error}</p>
                        <button onClick={() => setError(null)} className="text-xs font-semibold text-red-400 hover:text-red-600">✕</button>
                    </div>
                )}

                {showCreateForm && canManageRoadmaps && (
                    <div className="mb-6 rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-bold text-slate-700">Tạo Roadmap mới</h2>
                        <div className="flex items-center gap-3">
                            <input
                                autoFocus
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') void handleCreate();
                                    if (e.key === 'Escape') setShowCreateForm(false);
                                }}
                                placeholder="Tên roadmap (có thể đổi sau)..."
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                            <button
                                onClick={() => void handleCreate()}
                                disabled={creating}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                            >
                                {creating ? 'Đang tạo...' : 'Tạo'}
                            </button>
                            <button
                                onClick={() => setShowCreateForm(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                )}

                {roadmaps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
                        <div className="mb-3 text-4xl">🗺️</div>
                        <p className="text-sm font-medium text-slate-500">Chưa có roadmap nào</p>
                        {canManageRoadmaps ? (
                            <p className="mt-1 text-xs text-slate-400">Bấm &quot;Tạo Roadmap mới&quot; để bắt đầu</p>
                        ) : (
                            <p className="mt-3 text-sm font-semibold text-slate-500">
                                Đăng nhập bằng Google với tài khoản admin để tạo roadmap mới.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {roadmaps.map((roadmap) => (
                            <div
                                key={roadmap.id}
                                className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
                            >
                                <div className="mb-4 flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <span className="mb-2 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                                            Roadmap
                                        </span>
                                        <h2 className="truncate text-base font-bold leading-snug text-slate-800">
                                            {roadmap.name || 'Untitled Roadmap'}
                                        </h2>
                                    </div>
                                    {canManageRoadmaps && roadmap.id !== 'main' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); void handleDelete(roadmap.id, roadmap.name); }}
                                            disabled={deletingId === roadmap.id}
                                            title="Xóa roadmap"
                                            className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 opacity-0 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed"
                                        >
                                            {deletingId === roadmap.id ? <span className="text-xs">...</span> : <span className="text-xs">✕</span>}
                                        </button>
                                    )}
                                </div>

                                <p className="mb-4 text-xs text-slate-400">
                                    Cập nhật: {formatUpdatedAt(roadmap.updated_at)}
                                </p>

                                <button
                                    onClick={() => router.push(`/roadmap/${roadmap.id}`)}
                                    className="mt-auto w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-600 hover:bg-indigo-600 hover:text-white"
                                >
                                    Mở →
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
