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
            widthClassName="w-[560px] max-w-[94vw]"
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
                        Xác nhận
                    </button>
                </div>
            )}
        >
            <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-800 text-sm">Xác nhận thao tác</h3>
                    <div className="mt-2 max-h-[52vh] overflow-y-auto rounded border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap break-words">{message}</p>
                    </div>
                </div>
            </div>
        </SidePanelShell>
    );
}
