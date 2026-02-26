'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastProps {
    toasts: ToastMessage[];
    onRemove: (id: string) => void;
}

const ICONS = {
    success: <CheckCircle size={18} className="text-green-500 shrink-0" />,
    error: <XCircle size={18} className="text-red-500 shrink-0" />,
    info: <AlertCircle size={18} className="text-blue-500 shrink-0" />,
};

const BG = {
    success: 'bg-green-50 border-green-300',
    error: 'bg-red-50 border-red-300',
    info: 'bg-blue-50 border-blue-300',
};

export function Toast({ toasts, onRemove }: ToastProps) {
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg pointer-events-auto transition-all duration-300 ${BG[t.type]}`}
                >
                    {ICONS[t.type]}
                    <span className="text-sm text-gray-800 flex-1 leading-snug">{t.message}</span>
                    <button onClick={() => onRemove(t.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
