'use client';

import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface QuickFilterDropdownProps {
    anchorRect: DOMRect;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
}

export default function QuickFilterDropdown({
    anchorRect,
    onClose,
    children,
    width = 280,
}: QuickFilterDropdownProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', onMouseDown);
        }, 0);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[9999] rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{
                left: anchorRect.left,
                top: anchorRect.bottom + 4,
                width,
            }}
        >
            {children}
        </div>,
        document.body
    );
}
