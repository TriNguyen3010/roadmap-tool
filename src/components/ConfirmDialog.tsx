'use client';

import { AlertTriangle } from 'lucide-react';
import SidePanelShell from './SidePanelShell';

interface ConfirmDialogProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <SidePanelShell
            isOpen
            onClose={onCancel}
            title="Xác nhận"
            subtitle="Hành động này có thể không hoàn tác được"
            widthClassName="w-[380px]"
            zIndexClassName="z-[9998]"
            footer={(
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
            )}
        >
            <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <h3 className="font-bold text-gray-800 text-sm">Xác nhận thao tác</h3>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</p>
                </div>
            </div>
        </SidePanelShell>
    );
}
