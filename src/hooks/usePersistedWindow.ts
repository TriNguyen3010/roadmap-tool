import { useCallback, useEffect, useState } from 'react';

export type WindowState = { x: number; y: number; width: number; height: number };

const VIEWPORT_MARGIN = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const clampToViewport = (s: WindowState): WindowState => {
    const maxW = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1024) - VIEWPORT_MARGIN);
    const maxH = Math.max(240, (typeof window !== 'undefined' ? window.innerHeight : 768) - VIEWPORT_MARGIN);
    const width = clamp(s.width, 320, maxW);
    const height = clamp(s.height, 240, maxH);
    const maxX = Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1024) - width);
    const maxY = Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 768) - height);
    return { width, height, x: clamp(s.x, 0, maxX), y: clamp(s.y, 0, maxY) };
};

export const usePersistedWindow = (key: string, defaults: WindowState) => {
    const [state, setState] = useState<WindowState>(() => {
        if (typeof window === 'undefined') return defaults;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return clampToViewport(defaults);
            const parsed = JSON.parse(raw) as Partial<WindowState>;
            return clampToViewport({
                x: typeof parsed.x === 'number' ? parsed.x : defaults.x,
                y: typeof parsed.y === 'number' ? parsed.y : defaults.y,
                width: typeof parsed.width === 'number' ? parsed.width : defaults.width,
                height: typeof parsed.height === 'number' ? parsed.height : defaults.height,
            });
        } catch {
            return clampToViewport(defaults);
        }
    });

    useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* quota */ }
    }, [key, state]);

    useEffect(() => {
        const onResize = () => setState((prev) => clampToViewport(prev));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const setPosition = useCallback((pos: { x: number; y: number }) => {
        setState((prev) => clampToViewport({ ...prev, x: pos.x, y: pos.y }));
    }, []);

    const setSize = useCallback((size: { width: number; height: number }) => {
        setState((prev) => clampToViewport({ ...prev, width: size.width, height: size.height }));
    }, []);

    // Atomic update for resize from an edge/corner that changes BOTH position and size
    // (e.g. dragging the top edge shrinks height AND shifts y).
    const setBounds = useCallback((bounds: WindowState) => {
        setState(() => clampToViewport(bounds));
    }, []);

    return { state, setPosition, setSize, setBounds };
};
