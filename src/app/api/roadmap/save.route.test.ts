import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as saveRoadmapPost } from '@/app/api/roadmap/[id]/save/route';
import { POST as managerSavePost } from '@/app/api/roadmap/[id]/manager-save/route';

const {
    supabaseMock,
    authenticateAdminRequestMock,
    authenticateTeamRequestMock,
} = vi.hoisted(() => ({
    supabaseMock: {
        from: vi.fn(),
    },
    authenticateAdminRequestMock: vi.fn(),
    authenticateTeamRequestMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabase: supabaseMock,
}));

vi.mock('@/lib/serverTeamAuth', () => ({
    authenticateAdminRequest: authenticateAdminRequestMock,
    authenticateTeamRequest: authenticateTeamRequestMock,
}));

function createRequest(body: unknown): Request {
    return new Request('http://localhost/api/roadmap/roadmap-1/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function createSelectQuery(result: { data: unknown; error: unknown }) {
    const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
    };

    return query;
}

function createUpdateQuery(result: { data: unknown; error: unknown }) {
    const query = {
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        select: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
    };

    return query;
}

function createManagerDocument() {
    return {
        releaseName: 'Demo',
        milestones: [],
        items: [
            {
                id: 'team-fe',
                name: 'FE',
                type: 'team',
                teamRole: 'FE',
                status: 'None',
                progress: 0,
                children: [
                    {
                        id: 'item-fe-1',
                        name: 'Ship UI',
                        type: 'item',
                        status: 'None',
                        statusMode: 'manual',
                        manualStatus: 'None',
                        progress: 0,
                        created_at: '2026-04-02T10:00:00.000Z',
                        updated_at: '2026-04-02T10:00:00.000Z',
                    },
                ],
            },
        ],
    };
}

describe('roadmap save routes', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-02T20:00:00.000Z'));
        supabaseMock.from.mockReset();
        authenticateAdminRequestMock.mockReset();
        authenticateTeamRequestMock.mockReset();
        infoSpy.mockClear();
        warnSpy.mockClear();
        errorSpy.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('accepts admin save when baseVersion matches current version', async () => {
        authenticateAdminRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: { updated_at: '2026-04-02T19:59:00.000Z' },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000Z' },
                    error: null,
                })),
            });

        const response = await saveRoadmapPost(createRequest({
            document: { releaseName: 'Demo', items: [], milestones: [] },
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
        });
    });

    it('rejects stale admin save with version conflict payload', async () => {
        authenticateAdminRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
        });

        supabaseMock.from.mockReturnValueOnce({
            select: vi.fn(() => createSelectQuery({
                data: { updated_at: '2026-04-02T20:01:00.000Z' },
                error: null,
            })),
        });

        const response = await saveRoadmapPost(createRequest({
            document: { releaseName: 'Demo', items: [], milestones: [] },
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Conflict',
            code: 'VERSION_MISMATCH',
            serverVersion: '2026-04-02T20:01:00.000Z',
        });
    });

    it('accepts manager patch save when baseVersion matches current version', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: createManagerDocument(),
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000Z' },
                    error: null,
                })),
            });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'item-fe-1', field: 'status', value: 'FE Start' },
                { itemId: 'item-fe-1', field: 'quickNote', value: 'Working on it' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
        });
    });

    it('rejects stale manager patch save with version conflict payload', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        supabaseMock.from.mockReturnValueOnce({
            select: vi.fn(() => createSelectQuery({
                data: {
                    updated_at: '2026-04-02T20:01:00.000Z',
                    content: createManagerDocument(),
                },
                error: null,
            })),
        });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'item-fe-1', field: 'status', value: 'FE Start' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Conflict',
            code: 'VERSION_MISMATCH',
            serverVersion: '2026-04-02T20:01:00.000Z',
        });
    });
});
