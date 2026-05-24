import { useEffect, useRef, type RefObject } from 'react';

export type Position = { x: number; y: number };

export const useDraggable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    onChange: (pos: Position) => void;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, enabled = true } = params;

    // Stabilize the callback so re-renders don't tear down listeners mid-drag.
    // The ref is updated in an effect (not during render) to satisfy React's
    // refs-during-render lint rule; the update runs after commit, before any
    // user event can fire pointermove, so the listener always reads the latest.
    const onChangeRef = useRef(params.onChange);
    useEffect(() => { onChangeRef.current = params.onChange; });

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let activePointerId: number | null = null;
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
            activePointerId = event.pointerId;
            handle.setPointerCapture?.(event.pointerId);
        };

        const onMove = (event: PointerEvent) => {
            if (!active || event.pointerId !== activePointerId) return;
            const dx = event.clientX - startPointerX;
            const dy = event.clientY - startPointerY;
            onChangeRef.current({ x: startElX + dx, y: startElY + dy });
        };

        const release = (event: PointerEvent) => {
            if (event.pointerId !== activePointerId) return;
            active = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch {/* already released */}
            activePointerId = null;
        };

        // Listeners on the handle (capture routes events here in real browsers).
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
    }, [elementRef, handleRef, enabled]);
};
