import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useDraggable } from './useDraggable';

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
        value: () => ({ left: 100, top: 100, width: 200, height: 100, right: 300, bottom: 200, x: 100, y: 100, toJSON: () => '' }),
    });
    document.body.append(handle, element);
    return { element, handle };
};

describe('useDraggable', () => {
    it('calls onChange with new position on pointer drag', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();
        renderHook(() => {
            const elRef = useRef(element);
            const handleRef = useRef(handle);
            useDraggable({ elementRef: elRef, handleRef, onChange });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 150, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 180, pointerId: 1, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 180, pointerId: 1, bubbles: true }));
        });

        expect(onChange).toHaveBeenCalled();
        const last = onChange.mock.calls.at(-1)![0];
        expect(last.x).toBe(150); // 100 + (200-150)
        expect(last.y).toBe(130); // 100 + (180-150)
    });

    it('ignores right-click (button !== 0)', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();
        renderHook(() => {
            const elRef = useRef(element);
            const handleRef = useRef(handle);
            useDraggable({ elementRef: elRef, handleRef, onChange });
        });
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, button: 2, bubbles: true }));
        });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('stops calling onChange after pointerup', () => {
        const { element, handle } = makeRefs();
        const onChange = vi.fn();
        renderHook(() => {
            const elRef = useRef(element);
            const handleRef = useRef(handle);
            useDraggable({ elementRef: elRef, handleRef, onChange });
        });

        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 150, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 150, pointerId: 1, bubbles: true }));
        });
        const callsBefore = onChange.mock.calls.length;
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 999, clientY: 999, pointerId: 1, bubbles: true }));
        });
        expect(onChange.mock.calls.length).toBe(callsBefore);
    });
});
