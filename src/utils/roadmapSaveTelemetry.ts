import type { SessionUser } from '@/types/auth';

export type RoadmapSaveRoute = 'admin-save' | 'manager-save' | 'legacy-admin-save';
export type RoadmapSaveOutcome = 'success' | 'conflict' | 'rejected' | 'error';

export interface RoadmapSaveTelemetryEvent {
    route: RoadmapSaveRoute;
    roadmapId: string;
    outcome: RoadmapSaveOutcome;
    baseVersion?: string | null;
    serverVersion?: string | null;
    status?: number;
    reason?: string;
    changeCount?: number;
    actor?: Pick<SessionUser, 'role' | 'team'> | null;
}

export function logRoadmapSaveTelemetry(event: RoadmapSaveTelemetryEvent): void {
    const payload = JSON.stringify({
        ...event,
        actorRole: event.actor?.role ?? null,
        actorTeam: event.actor?.team ?? null,
    });

    if (event.outcome === 'error') {
        console.error(`[roadmap-save] ${payload}`);
        return;
    }

    if (event.outcome === 'conflict' || event.outcome === 'rejected') {
        console.warn(`[roadmap-save] ${payload}`);
        return;
    }

    console.info(`[roadmap-save] ${payload}`);
}
