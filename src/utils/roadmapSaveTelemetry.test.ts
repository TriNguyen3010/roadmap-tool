import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logRoadmapSaveTelemetry } from './roadmapSaveTelemetry';

describe('roadmapSaveTelemetry', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        infoSpy.mockClear();
        warnSpy.mockClear();
        errorSpy.mockClear();
    });

    afterEach(() => {
        infoSpy.mockClear();
        warnSpy.mockClear();
        errorSpy.mockClear();
    });

    it('writes success events to console.info', () => {
        logRoadmapSaveTelemetry({
            route: 'admin-save',
            roadmapId: 'roadmap-1',
            outcome: 'success',
            baseVersion: '2026-04-02T12:00:00.000Z',
            actor: { role: 'admin', team: 'PM' },
        });

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy.mock.calls[0]?.[0]).toContain('"outcome":"success"');
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('writes conflict events to console.warn', () => {
        logRoadmapSaveTelemetry({
            route: 'manager-save',
            roadmapId: 'roadmap-2',
            outcome: 'conflict',
            baseVersion: '2026-04-02T12:00:00.000Z',
            serverVersion: '2026-04-02T12:01:00.000Z',
            status: 409,
            changeCount: 2,
            actor: { role: 'manager', team: 'FE' },
        });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('"status":409');
        expect(infoSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('writes error events to console.error', () => {
        logRoadmapSaveTelemetry({
            route: 'legacy-admin-save',
            roadmapId: 'main',
            outcome: 'error',
            reason: 'save-failed',
            status: 500,
        });

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0]?.[0]).toContain('"reason":"save-failed"');
        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
