'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SidePanelShellProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    widthClassName?: string;
    zIndexClassName?: string;
    beforePanel?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    headerRight?: ReactNode;
}

export default function SidePanelShell({
    isOpen,
    onClose,
    title,
    subtitle,
    widthClassName = 'w-[420px]',
    zIndexClassName = 'z-50',
    beforePanel,
    children,
    footer,
    headerRight,
}: SidePanelShellProps) {
    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 ${zIndexClassName} flex`} role="dialog" aria-modal="true">
            <button
                type="button"
                aria-label="Close panel"
                className="flex-1 bg-black/35"
                onClick={onClose}
            />
            {beforePanel}
            <aside className={`${widthClassName} h-full bg-white border-l border-gray-200 shadow-2xl flex flex-col`}>
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800">{title}</p>
                        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                        {headerRight}
                        <button
                            onClick={onClose}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            title="Đóng panel"
                        >
                            <X size={16} className="text-gray-500" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
                {footer && <div className="border-t border-gray-200 bg-gray-50 p-3">{footer}</div>}
            </aside>
        </div>
    );
}
