import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useResizable, type ResizeDirection, type Bounds } from './useResizable';

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

type ResizeFn = (bounds: Bounds) => void;
const setupHook = (direction: ResizeDirection | undefined, onResize: ResizeFn, min = { width: 100, height: 80 }, max = { width: 9999, height: 9999 }) => {
    const { element, handle } = makeRefs();
    renderHook(() => {
        const elRef = useRef(element);
        const hRef = useRef(handle);
        useResizable({ elementRef: elRef, handleRef: hRef, direction, onResize, min, max });
    });
    return { element, handle };
};

const drag = (handle: HTMLElement, from: [number, number], to: [number, number]) => {
    act(() => {
        handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: from[0], clientY: from[1], pointerId: 1, button: 0, bubbles: true }));
        handle.dispatchEvent(new PointerEvent('pointermove', { clientX: to[0], clientY: to[1], pointerId: 1, bubbles: true }));
        handle.dispatchEvent(new PointerEvent('pointerup', { clientX: to[0], clientY: to[1], pointerId: 1, bubbles: true }));
    });
};

describe('useResizable (default SE direction)', () => {
    it('SE drag grows width and height, position unchanged', () => {
        const onResize = vi.fn();
        const { handle } = setupHook(undefined, onResize);
        drag(handle, [400, 300], [500, 380]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(500);
        expect(last.height).toBe(380);
        expect(last.x).toBe(0);
        expect(last.y).toBe(0);
    });

    it('clamps to min size (SE)', () => {
        const onResize = vi.fn();
        const { handle } = setupHook(undefined, onResize, { width: 320, height: 240 });
        drag(handle, [400, 300], [0, 0]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(320);
        expect(last.height).toBe(240);
    });

    it('stops calling onResize after pointerup', () => {
        const onResize = vi.fn();
        const { handle } = setupHook(undefined, onResize);
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 1, button: 0, bubbles: true }));
            handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 300, pointerId: 1, bubbles: true }));
        });
        const before = onResize.mock.calls.length;
        act(() => {
            handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 999, clientY: 999, pointerId: 1, bubbles: true }));
        });
        expect(onResize.mock.calls.length).toBe(before);
    });
});

describe('useResizable (edge directions)', () => {
    it('N drag up: height grows, top shifts up', () => {
        const onResize = vi.fn();
        // Pointer starts at top edge (y=0), moves up by 50px
        const { handle } = setupHook('n', onResize);
        drag(handle, [200, 0], [200, -50]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.height).toBe(350); // 300 + 50
        expect(last.y).toBe(-50);       // top shifted up by 50
        expect(last.width).toBe(400);   // unchanged
        expect(last.x).toBe(0);
    });

    it('S drag down: only height grows, top unchanged', () => {
        const onResize = vi.fn();
        const { handle } = setupHook('s', onResize);
        drag(handle, [200, 300], [200, 380]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.height).toBe(380);
        expect(last.y).toBe(0);
        expect(last.width).toBe(400);
    });

    it('W drag left: width grows, left shifts left', () => {
        const onResize = vi.fn();
        const { handle } = setupHook('w', onResize);
        drag(handle, [0, 150], [-60, 150]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(460); // 400 + 60
        expect(last.x).toBe(-60);     // left shifted by 60
        expect(last.height).toBe(300);
        expect(last.y).toBe(0);
    });

    it('E drag right: only width grows, left unchanged', () => {
        const onResize = vi.fn();
        const { handle } = setupHook('e', onResize);
        drag(handle, [400, 150], [500, 150]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(500);
        expect(last.x).toBe(0);
        expect(last.height).toBe(300);
    });
});

describe('useResizable (corner directions)', () => {
    it('NW combines N + W', () => {
        const onResize = vi.fn();
        const { handle } = setupHook('nw', onResize);
        drag(handle, [0, 0], [-40, -30]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(440);  // 400 + 40
        expect(last.height).toBe(330); // 300 + 30
        expect(last.x).toBe(-40);
        expect(last.y).toBe(-30);
    });

    it('SW combines S + W', () => {
        const onResize = vi.fn();
        const { handle } = setupHook('sw', onResize);
        drag(handle, [0, 300], [-40, 360]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(440);
        expect(last.height).toBe(360);
        expect(last.x).toBe(-40);
        expect(last.y).toBe(0); // top unchanged
    });
});

describe('useResizable (clamp keeps edges in sync)', () => {
    it('W drag right past min: width clamped at min, left stops shifting', () => {
        const onResize = vi.fn();
        // Dragging W edge to the right (positive dx) shrinks width.
        // With min width=320 and start width=400, the max dx before clamp is 80.
        // Drag by 200 (way past). Expected: width clamped at 320, x = 400-320 = 80.
        const { handle } = setupHook('w', onResize, { width: 320, height: 240 });
        drag(handle, [0, 150], [200, 150]);
        const last = onResize.mock.calls.at(-1)![0];
        expect(last.width).toBe(320);
        expect(last.x).toBe(80); // not 200 — capped by the clamp
    });
});
