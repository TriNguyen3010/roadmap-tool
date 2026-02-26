'use client';

import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6 flex flex-col gap-4 border border-gray-200">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={22} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm">Xác nhận</h3>
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</p>
                    </div>
                    <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-600 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        Huỷ
                    </button>
                    <button
                        onClick={() => { onConfirm(); }}
                        className="px-4 py-1.5 rounded bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
                    >
                        Xác nhận xoá
                    </button>
                </div>
            </div>
        </div>
    );
}
