import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH as patchRoadmapPost } from '@/app/api/roadmap/[id]/route';
import { POST as saveRoadmapPost } from '@/app/api/roadmap/[id]/save/route';
import { POST as managerSavePost } from '@/app/api/roadmap/[id]/manager-save/route';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const {
    supabaseMock,
    authenticateAdminRequestMock,
    authenticateTeamRequestMock,
    fullDocumentSyncMock,
    loadItemWithAncestorsMock,
    updateItemFieldsMock,
    regenerateJsonBlobMock,
    loadRoadmapDocumentFromRowsMock,
} = vi.hoisted(() => ({
    supabaseMock: { from: vi.fn(), rpc: vi.fn() },
    authenticateAdminRequestMock: vi.fn(),
    authenticateTeamRequestMock: vi.fn(),
    fullDocumentSyncMock: vi.fn(),
    loadItemWithAncestorsMock: vi.fn(),
    updateItemFieldsMock: vi.fn(),
    regenerateJsonBlobMock: vi.fn(),
    loadRoadmapDocumentFromRowsMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

vi.mock('@/lib/serverTeamAuth', () => ({
    authenticateAdminRequest: authenticateAdminRequestMock,
    authenticateTeamRequest: authenticateTeamRequestMock,
}));

vi.mock('@/server/roadmapRowsRepo', () => ({
    fullDocumentSync: fullDocumentSyncMock,
    loadItemWithAncestors: loadItemWithAncestorsMock,
    updateItemFields: updateItemFieldsMock,
    regenerateJsonBlob: regenerateJsonBlobMock,
    loadRoadmapDocumentFromRows: loadRoadmapDocumentFromRowsMock,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
    return new Request('http://localhost/api/roadmap/roadmap-1/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const ADMIN_AUTH = {
    sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
};

const FE_MANAGER_AUTH = {
    sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
    member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
};

const BE_MANAGER_AUTH = {
    sessionUser: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE' },
    member: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE', is_active: true },
};

const ROADMAP_PARAMS = { params: Promise.resolve({ id: 'roadmap-1' }) };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('roadmap save routes (table-based)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-02T20:00:00.000Z'));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── Admin save ───────────────────────────────────────────────────────────

    it('accepts admin save and returns success with updatedAt', async () => {
        authenticateAdminRequestMock.mockResolvedValue(ADMIN_AUTH);
        fullDocumentSyncMock.mockResolvedValue({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
        });

        const response = await saveRoadmapPost(createRequest({
            document: { releaseName: 'Demo', items: [], milestones: [] },
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
        });
        expect(fullDocumentSyncMock).toHaveBeenCalledOnce();
    });

    it('rejects admin save without auth', async () => {
        authenticateAdminRequestMock.mockResolvedValue(null);

        const response = await saveRoadmapPost(createRequest({
            document: { releaseName: 'Demo', items: [], milestones: [] },
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(401);
    });

    it('returns 500 when fullDocumentSync fails', async () => {
        authenticateAdminRequestMock.mockResolvedValue(ADMIN_AUTH);
        fullDocumentSyncMock.mockResolvedValue({
            success: false,
            updatedAt: '',
            error: 'DB error',
        });

        const response = await saveRoadmapPost(createRequest({
            document: { releaseName: 'Demo', items: [], milestones: [] },
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(500);
    });

    // ── Manager save ─────────────────────────────────────────────────────────

    it('accepts manager save on own team item (row-level)', async () => {
        authenticateTeamRequestMock.mockResolvedValue(FE_MANAGER_AUTH);

        // loadItemWithAncestors returns FE team item + parent group
        loadItemWithAncestorsMock.mockResolvedValue([
            { itemId: 'team-fe', teamRole: 'FE', itemType: 'team', name: 'FE' },
            { itemId: 'group-1', itemType: 'group', name: 'Group' },
        ]);
        updateItemFieldsMock.mockResolvedValue({ success: true });
        regenerateJsonBlobMock.mockResolvedValue(undefined);
        loadRoadmapDocumentFromRowsMock.mockResolvedValue({
            releaseName: 'Demo', items: [], milestones: [],
        });

        const response = await managerSavePost(createRequest({
            changes: [{ itemId: 'team-fe', field: 'status', value: 'FE in progress' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.success).toBe(true);
        expect(updateItemFieldsMock).toHaveBeenCalledOnce();
    });

    it('rejects manager save on another team item', async () => {
        authenticateTeamRequestMock.mockResolvedValue(FE_MANAGER_AUTH);

        // Item belongs to BE team
        loadItemWithAncestorsMock.mockResolvedValue([
            { itemId: 'team-be', teamRole: 'BE', itemType: 'team', name: 'BE' },
            { itemId: 'group-1', itemType: 'group', name: 'Group' },
        ]);

        const response = await managerSavePost(createRequest({
            changes: [{ itemId: 'team-be', field: 'status', value: 'BE in progress' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(403);
        const payload = await response.json();
        expect(payload.error).toBe('Permission denied');
        expect(updateItemFieldsMock).not.toHaveBeenCalled();
    });

    it('rejects manager save on disallowed field', async () => {
        authenticateTeamRequestMock.mockResolvedValue(FE_MANAGER_AUTH);

        loadItemWithAncestorsMock.mockResolvedValue([
            { itemId: 'team-fe', teamRole: 'FE', itemType: 'team', name: 'FE' },
        ]);

        const response = await managerSavePost(createRequest({
            changes: [{ itemId: 'team-fe', field: 'name', value: 'New Name' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(403);
        expect(updateItemFieldsMock).not.toHaveBeenCalled();
    });

    it('rejects manager save without auth', async () => {
        authenticateTeamRequestMock.mockResolvedValue(null);

        const response = await managerSavePost(createRequest({
            changes: [{ itemId: 'team-fe', field: 'status', value: 'FE in progress' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(401);
    });

    it('returns 400 when admin-level user calls manager-save', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
            member: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin', is_active: true },
        });

        const response = await managerSavePost(createRequest({
            changes: [{ itemId: 'team-fe', field: 'status', value: 'FE in progress' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(400);
    });

    // ── PATCH (milestones / release-meta) ────────────────────────────────────

    it('patches milestones via direct table write', async () => {
        authenticateAdminRequestMock.mockResolvedValue(ADMIN_AUTH);

        // Mock supabase.from calls for PATCH
        const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
        const insertMock = vi.fn().mockResolvedValue({ error: null });
        const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

        supabaseMock.from.mockImplementation((table: string) => {
            if (table === 'roadmap_milestones') return { delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }), insert: insertMock };
            if (table === 'roadmaps') return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
            return { delete: deleteMock, insert: insertMock, update: updateMock };
        });

        loadRoadmapDocumentFromRowsMock.mockResolvedValue({
            releaseName: 'Demo',
            startDate: '',
            endDate: '',
            milestones: [{ id: 'phase_1', label: 'Week 1', startDate: '2026-04-01', endDate: '2026-04-01', color: '#3b82f6' }],
            items: [],
        });
        regenerateJsonBlobMock.mockResolvedValue(undefined);

        const response = await patchRoadmapPost(createRequest({
            kind: 'milestones',
            milestones: [{ id: '', label: '', startDate: '2026-04-01', endDate: '', color: '' }],
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.success).toBe(true);
        expect(payload.document.milestones).toHaveLength(1);
    });

    it('patches release metadata via direct table write', async () => {
        authenticateAdminRequestMock.mockResolvedValue(ADMIN_AUTH);

        supabaseMock.from.mockImplementation(() => ({
            update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }));

        loadRoadmapDocumentFromRowsMock.mockResolvedValue({
            releaseName: 'New Name',
            startDate: '', endDate: '',
            milestones: [], items: [],
        });
        regenerateJsonBlobMock.mockResolvedValue(undefined);

        const response = await patchRoadmapPost(createRequest({
            kind: 'release-meta',
            releaseName: ' New Name ',
        }) as never, ROADMAP_PARAMS);

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.success).toBe(true);
        expect(payload.document.releaseName).toBe('New Name');
    });
});
