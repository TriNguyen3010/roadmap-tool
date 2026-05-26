export interface RoadmapBackup {
    roadmapId: string;
    releaseName: string;
    status: 'success' | 'failed';
    fileSize?: string;
    elapsed?: string;
    error?: string;
}

export interface AggregateDump {
    kind: 'aggregate';
    timestamp: string;
    timestampLocal: string;
    elapsed: string;
    summary: { total: number; success: number; failed: number };
    roadmaps: RoadmapBackup[];
}

export interface LegacyDump {
    kind: 'legacy';
    timestamp: string;
    timestampLocal: string;
    roadmapId: string;
    status: 'success' | 'failed' | string;
    fileSize: string;
    elapsed: string;
}

export interface DiscoveryFailedDump {
    kind: 'discovery_failed';
    timestamp: string;
    timestampLocal: string;
    elapsed: string;
    error: string;
}

export type LastDump = AggregateDump | LegacyDump | DiscoveryFailedDump;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

export function parseLastDump(raw: unknown): LastDump | null {
    if (!isRecord(raw)) return null;

    const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : '';
    const timestampLocal = typeof raw.timestampLocal === 'string' ? raw.timestampLocal : '';
    const elapsed = typeof raw.elapsed === 'string' ? raw.elapsed : '';

    if (raw.status === 'discovery_failed') {
        if (!timestampLocal) return null;
        return {
            kind: 'discovery_failed',
            timestamp,
            timestampLocal,
            elapsed,
            error: typeof raw.error === 'string' ? raw.error : 'discovery failed',
        };
    }

    if (isRecord(raw.summary) && Array.isArray(raw.roadmaps)) {
        const s = raw.summary;
        return {
            kind: 'aggregate',
            timestamp,
            timestampLocal,
            elapsed,
            summary: {
                total: typeof s.total === 'number' ? s.total : 0,
                success: typeof s.success === 'number' ? s.success : 0,
                failed: typeof s.failed === 'number' ? s.failed : 0,
            },
            roadmaps: raw.roadmaps.filter(isRecord).map((r): RoadmapBackup => ({
                roadmapId: typeof r.roadmapId === 'string' ? r.roadmapId : '',
                releaseName: typeof r.releaseName === 'string' ? r.releaseName : '',
                status: r.status === 'failed' ? 'failed' : 'success',
                fileSize: typeof r.fileSize === 'string' ? r.fileSize : undefined,
                elapsed: typeof r.elapsed === 'string' ? r.elapsed : undefined,
                error: typeof r.error === 'string' ? r.error : undefined,
            })),
        };
    }

    if (typeof raw.roadmapId === 'string' && typeof raw.status === 'string') {
        return {
            kind: 'legacy',
            timestamp,
            timestampLocal,
            roadmapId: raw.roadmapId,
            status: raw.status,
            fileSize: typeof raw.fileSize === 'string' ? raw.fileSize : '',
            elapsed: typeof raw.elapsed === 'string' ? raw.elapsed : '',
        };
    }

    return null;
}
