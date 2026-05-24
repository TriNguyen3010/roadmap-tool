import { useEffect, type RefObject } from 'react';

export type Position = { x: number; y: number };

export const useDraggable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    onChange: (pos: Position) => void;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, onChange, enabled = true } = params;

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let startPointerX = 0;
        let startPointerY = 0;
        let startElX = 0;
        let startElY = 0;

        const onDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const el = elementRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            startPointerX = event.clientX;
            startPointerY = event.clientY;
            startElX = rect.left;
            startElY = rect.top;
            active = true;
            handle.setPointerCapture?.(event.pointerId);
        };

        const onMove = (event: PointerEvent) => {
            if (!active) return;
            const dx = event.clientX - startPointerX;
            const dy = event.clientY - startPointerY;
            onChange({ x: startElX + dx, y: startElY + dy });
        };

        const onUp = () => { active = false; };

        handle.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            handle.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [elementRef, handleRef, onChange, enabled]);
};
