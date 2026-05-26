import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedWindow } from './usePersistedWindow';

const DEFAULTS = { x: 100, y: 100, width: 720, height: 560 };

describe('usePersistedWindow', () => {
    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, 'innerWidth', { value: 2000, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 1500, configurable: true });
    });

    it('returns defaults when localStorage empty', () => {
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state).toEqual(DEFAULTS);
    });

    it('loads from localStorage', () => {
        localStorage.setItem('test-key', JSON.stringify({ x: 200, y: 200, width: 800, height: 600 }));
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state).toEqual({ x: 200, y: 200, width: 800, height: 600 });
    });

    it('clamps oversized stored state to viewport', () => {
        localStorage.setItem('test-key', JSON.stringify({ x: -50, y: -50, width: 9999, height: 9999 }));
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        expect(result.current.state.x).toBeGreaterThanOrEqual(0);
        expect(result.current.state.y).toBeGreaterThanOrEqual(0);
        expect(result.current.state.width).toBeLessThanOrEqual(2000 - 40);
        expect(result.current.state.height).toBeLessThanOrEqual(1500 - 40);
    });

    it('persists on setPosition + setSize', () => {
        const { result } = renderHook(() => usePersistedWindow('test-key', DEFAULTS));
        act(() => { result.current.setPosition({ x: 50, y: 60 }); });
        act(() => { result.current.setSize({ width: 800, height: 600 }); });
        const stored = JSON.parse(localStorage.getItem('test-key')!);
        expect(stored).toEqual({ x: 50, y: 60, width: 800, height: 600 });
    });
});
