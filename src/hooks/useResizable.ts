import { useEffect, useRef, type RefObject } from 'react';

export type Size = { width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const useResizable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    onChange: (size: Size) => void;
    min: Size;
    max: Size;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, min, max, enabled = true } = params;

    // Stabilize callback so re-renders don't tear down listeners mid-resize.
    // Ref is updated in an effect to satisfy React's refs-during-render lint
    // rule; commit-time update is safe because no user event can fire between
    // a render and the next effect flush in the same tick.
    const onChangeRef = useRef(params.onChange);
    useEffect(() => { onChangeRef.current = params.onChange; });

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let activePointerId: number | null = null;
        let startX = 0;
        let startY = 0;
        let startW = 0;
        let startH = 0;

        const onDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const el = elementRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            startX = event.clientX;
            startY = event.clientY;
            startW = rect.width;
            startH = rect.height;
            active = true;
            activePointerId = event.pointerId;
            handle.setPointerCapture?.(event.pointerId);
        };

        const onMove = (event: PointerEvent) => {
            if (!active || event.pointerId !== activePointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            onChangeRef.current({
                width: clamp(startW + dx, min.width, max.width),
                height: clamp(startH + dy, min.height, max.height),
            });
        };

        const release = (event: PointerEvent) => {
            if (event.pointerId !== activePointerId) return;
            active = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch {/* already released */}
            activePointerId = null;
        };

        handle.addEventListener('pointerdown', onDown);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', release);
        handle.addEventListener('pointercancel', release);
        return () => {
            handle.removeEventListener('pointerdown', onDown);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', release);
            handle.removeEventListener('pointercancel', release);
        };
    }, [elementRef, handleRef, min.width, min.height, max.width, max.height, enabled]);
};
