import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useResizable } from './useResizable';

// PointerEvent polyfill for jsdom 25 (same as useDraggable.test.tsx)
if (typeof PointerEvent === 'undefined') {
    class P extends MouseEvent {
        pointerId: number;
        constructor(type: string, params: PointerEventInit = {}) {
            super(type, params);
            this.pointerId = params.pointerId ?? 0;
        }
    }
    (global as unknown as { PointerEvent: typeof P }).PointerEvent = P;
}

const makeRefs = () => {
    const element = document.createElement('div');
    const handle = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => '' }),
    });
    document.body.append(element, handle);
    return { element, handle };
};

describe('useResizable', () => {
    it('changes size on drag of resize handle', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();

        renderHook(() => {
            const elRef = useRef(element);
            const hRef = useRef(handle);
            useResizable({ elementRef: elRef, handleRef: hRef, onChange, min: { width: 100, height: 80 }, max: { width: 9999, height: 9999 } });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 380, pointerId: 1, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, clientY: 380, pointerId: 1, bubbles: true }));
        });

        const last = onChange.mock.calls.at(-1)![0];
        expect(last.width).toBe(500);
        expect(last.height).toBe(380);
    });

    it('clamps to min', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();

        renderHook(() => {
            const elRef = useRef(element);
            const hRef = useRef(handle);
            useResizable({ elementRef: elRef, handleRef: hRef, onChange, min: { width: 320, height: 240 }, max: { width: 9999, height: 9999 } });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }));
        });
        const last = onChange.mock.calls.at(-1)![0];
        expect(last.width).toBe(320);
        expect(last.height).toBe(240);
    });

    it('stops calling onChange after pointerup', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();

        renderHook(() => {
            const elRef = useRef(element);
            const hRef = useRef(handle);
            useResizable({ elementRef: elRef, handleRef: hRef, onChange, min: { width: 100, height: 80 }, max: { width: 9999, height: 9999 } });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300, pointerId: 1, bubbles: true }));
        });
        const callsBefore = onChange.mock.calls.length;
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 999, clientY: 999, pointerId: 1, bubbles: true }));
        });
        expect(onChange.mock.calls.length).toBe(callsBefore);
    });
});
