import { useEffect, useRef, type RefObject } from 'react';

export type Size = { width: number; height: number };
export type Position = { x: number; y: number };
export type Bounds = Position & Size;
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hasN = (d: ResizeDirection) => d === 'n' || d === 'ne' || d === 'nw';
const hasS = (d: ResizeDirection) => d === 's' || d === 'se' || d === 'sw';
const hasE = (d: ResizeDirection) => d === 'e' || d === 'ne' || d === 'se';
const hasW = (d: ResizeDirection) => d === 'w' || d === 'nw' || d === 'sw';

export const useResizable = (params: {
    elementRef: RefObject<HTMLElement | null>;
    handleRef: RefObject<HTMLElement | null>;
    direction?: ResizeDirection;
    onResize: (bounds: Bounds) => void;
    min: Size;
    max: Size;
    enabled?: boolean;
}) => {
    const { elementRef, handleRef, direction = 'se', min, max, enabled = true } = params;

    // Stabilize callback (see useDraggable comment).
    const onResizeRef = useRef(params.onResize);
    useEffect(() => { onResizeRef.current = params.onResize; });

    useEffect(() => {
        if (!enabled) return;
        const handle = handleRef.current;
        if (!handle) return;

        let active = false;
        let activePointerId: number | null = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let startW = 0;
        let startH = 0;

        const onDown = (event: PointerEvent) => {
            if (event.button !== 0) return;
            const el = elementRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            startW = rect.width;
            startH = rect.height;
            active = true;
            activePointerId = event.pointerId;
            handle.setPointerCapture?.(event.pointerId);
            // Prevent the parent drag (header) from also reacting.
            event.stopPropagation();
        };

        const onMove = (event: PointerEvent) => {
            if (!active || event.pointerId !== activePointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;

            let newW = startW;
            let newH = startH;
            let newLeft = startLeft;
            let newTop = startTop;

            if (hasE(direction)) {
                newW = clamp(startW + dx, min.width, max.width);
            } else if (hasW(direction)) {
                newW = clamp(startW - dx, min.width, max.width);
                // When width is clamped, the actual delta is smaller than dx; reflect that in left edge.
                newLeft = startLeft + (startW - newW);
            }

            if (hasS(direction)) {
                newH = clamp(startH + dy, min.height, max.height);
            } else if (hasN(direction)) {
                newH = clamp(startH - dy, min.height, max.height);
                newTop = startTop + (startH - newH);
            }

            onResizeRef.current({ x: newLeft, y: newTop, width: newW, height: newH });
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
    }, [elementRef, handleRef, direction, min.width, min.height, max.width, max.height, enabled]);
};
