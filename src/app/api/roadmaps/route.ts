import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/serverTeamAuth';
import { filterVisibleRoadmaps } from '@/utils/roadmapVisibility';
import { parseLastDump } from '@/utils/lastDump';

export const runtime = 'nodejs';

interface RoadmapListItem {
    id: string;
    name: string;
    updated_at: string | null;
    storage_mode: 'json' | 'table';
}

function getRoadmapNameFromContent(content: unknown): string {
    if (content && typeof content === 'object' && 'releaseName' in content) {
        const releaseName = (content as { releaseName?: unknown }).releaseName;
        if (typeof releaseName === 'string' && releaseName.trim()) {
            return releaseName.trim();
        }
    }
    return 'Untitled Roadmap';
}

function isLocalRequest(request: NextRequest): boolean {
    const host = (request.headers.get('host') || request.nextUrl.hostname).split(':')[0];
    return host === 'localhost' || host === '127.0.0.1';
}

async function readLocalBackupRoadmapIds(request: NextRequest): Promise<Set<string>> {
    if (!isLocalRequest(request)) return new Set();
    try {
        const filePath = path.join(process.cwd(), 'data', 'last-dump.json');
        const parsed = parseLastDump(JSON.parse(await readFile(filePath, 'utf-8')));
        if (parsed?.kind !== 'aggregate') return new Set();
        return new Set(parsed.roadmaps.map((roadmap) => roadmap.roadmapId).filter(Boolean));
    } catch {
        return new Set();
    }
}

function filterLocalBackupList(list: RoadmapListItem[], backupIds: Set<string>): RoadmapListItem[] {
    if (backupIds.size === 0) return list;
    const backedUpRoadmaps = list.filter((item) => backupIds.has(item.id));
    return backedUpRoadmaps.length > 0 ? backedUpRoadmaps : list;
}

// GET /api/roadmaps — list all roadmaps (id, name, updated_at)
// Merges legacy (roadmap_data) and new (roadmaps table) sources.
export async function GET(request: NextRequest) {
    try {
        const [roadmapsRes, legacyRes, backupIds] = await Promise.all([
            supabase
                .from('roadmaps')
                .select('id, release_name, updated_at, storage_mode')
                .order('updated_at', { ascending: false }),
            supabase
                .from('roadmap_data')
                .select('id, content, updated_at, storage_mode')
                .order('updated_at', { ascending: false }),
            readLocalBackupRoadmapIds(request),
        ]);

        if (roadmapsRes.error) throw roadmapsRes.error;
        if (legacyRes.error) throw legacyRes.error;

        const byId = new Map<string, RoadmapListItem>();
        const legacyIds = new Set((legacyRes.data ?? []).map((row) => row.id));

        for (const row of roadmapsRes.data ?? []) {
            const storageMode = row.storage_mode === 'table' || !legacyIds.has(row.id) ? 'table' : 'json';
            byId.set(row.id, {
                id: row.id,
                name: row.release_name || 'Untitled Roadmap',
                updated_at: row.updated_at,
                storage_mode: storageMode,
            });
        }

        for (const row of legacyRes.data ?? []) {
            if (byId.has(row.id)) continue;
            byId.set(row.id, {
                id: row.id,
                name: getRoadmapNameFromContent(row.content),
                updated_at: row.updated_at,
                storage_mode: row.storage_mode === 'table' ? 'table' : 'json',
            });
        }

        const list = filterLocalBackupList(Array.from(byId.values()), backupIds)
            .sort((a, b) => {
                const aTime = a.updated_at ? Date.parse(a.updated_at) : 0;
                const bTime = b.updated_at ? Date.parse(b.updated_at) : 0;
                return bTime - aTime;
            });

        return NextResponse.json(filterVisibleRoadmaps(list));
    } catch (error) {
        console.error('Failed to list roadmaps:', error);
        return NextResponse.json({ error: 'Failed to list roadmaps' }, { status: 500 });
    }
}

// POST /api/roadmaps — create a new roadmap (uses table-based storage)
export async function POST(request: NextRequest) {
    try {
        if (!(await authenticateAdminRequest(request))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const name = typeof body?.name === 'string' && body.name.trim()
            ? body.name.trim()
            : 'Untitled Roadmap';

        const { randomUUID } = await import('crypto');
        const id = randomUUID();
        const now = new Date().toISOString();

        // Create in roadmaps table with storage_mode = 'table'
        const { error: roadmapError } = await supabase
            .from('roadmaps')
            .insert({
                id,
                release_name: name,
                start_date: '',
                end_date: '',
                storage_mode: 'table',
                created_at: now,
                updated_at: now,
            });

        if (roadmapError) {
            console.error('Supabase insert roadmaps error:', JSON.stringify(roadmapError));
            return NextResponse.json({ error: 'Supabase error', message: roadmapError.message }, { status: 500 });
        }

        // Also create a backup JSON blob entry
        const emptyDoc = { releaseName: name, startDate: '', endDate: '', milestones: [], items: [] };
        await supabase
            .from('roadmap_data')
            .insert({ id, content: emptyDoc, updated_at: now, storage_mode: 'table' });

        return NextResponse.json({ id, name }, { status: 201 });
    } catch (err) {
        console.error('Failed to create roadmap:', err);
        return NextResponse.json({ error: 'Failed to create roadmap', message: String(err) }, { status: 500 });
    }
}
