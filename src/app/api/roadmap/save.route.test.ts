import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH as patchRoadmapPost } from '@/app/api/roadmap/[id]/route';
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

const SIBLING_TEAM_ROLES = ['BA', 'PD', 'BE', 'FE', 'QC', 'DevOps'] as const;
type SiblingTeamRole = typeof SIBLING_TEAM_ROLES[number];

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

function createSiblingTeamDocument(statusOverrides: Partial<Record<SiblingTeamRole, string>> = {}) {
    return {
        releaseName: 'Demo',
        milestones: [],
        items: [
            {
                id: 'group-ccd-plt',
                name: '[CCD] Display txn history for PLT token',
                type: 'group',
                status: 'None',
                progress: 0,
                children: SIBLING_TEAM_ROLES.map((teamRole) => ({
                    id: `team-${teamRole.toLowerCase()}`,
                    name: teamRole,
                    type: 'team',
                    teamRole,
                    status: statusOverrides[teamRole] ?? 'None',
                    statusMode: 'manual',
                    manualStatus: statusOverrides[teamRole] ?? 'None',
                    progress: 0,
                    created_at: '2026-04-02T10:00:00.000Z',
                    updated_at: '2026-04-02T10:00:00.000Z',
                })),
            },
        ],
    };
}

function getTeamStatusFromDocument(document: unknown, teamRole: SiblingTeamRole): string | undefined {
    if (!document || typeof document !== 'object') return undefined;
    const doc = document as { items?: Array<{ children?: Array<{ teamRole?: string; status?: string }> }> };
    const group = doc.items?.[0];
    return group?.children?.find(child => child.teamRole === teamRole)?.status;
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

    it('accepts admin save when baseVersion matches the same timestamp in a different format', async () => {
        authenticateAdminRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: { updated_at: '2026-04-02T19:59:00.000+00:00' },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000+00:00' },
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
            updatedAt: '2026-04-02T20:00:00.000+00:00',
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

    it('patches milestones without sending the full item tree', async () => {
        authenticateAdminRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000+00:00',
                        content: {
                            releaseName: 'Demo',
                            startDate: '',
                            endDate: '',
                            milestones: [],
                            items: [{ id: 'item-1', name: 'Task', type: 'item', status: 'None', progress: 0 }],
                        },
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000+00:00' },
                    error: null,
                })),
            });

        const response = await patchRoadmapPost(createRequest({
            kind: 'milestones',
            milestones: [{ id: '', label: '', startDate: '2026-04-01', endDate: '', color: '' }],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000+00:00',
            document: {
                milestones: [{
                    id: 'phase_1',
                    label: 'Week 1',
                    startDate: '2026-04-01',
                    endDate: '2026-04-01',
                }],
            },
        });
    });

    it('patches release metadata without touching the item tree', async () => {
        authenticateAdminRequestMock.mockResolvedValue({
            sessionUser: { email: 'admin@example.com', role: 'admin', team: 'PM', label: 'Admin' },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: {
                            releaseName: 'Old Name',
                            startDate: '',
                            endDate: '',
                            milestones: [],
                            items: [{ id: 'item-1', name: 'Task', type: 'item', status: 'None', progress: 0 }],
                        },
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

        const response = await patchRoadmapPost(createRequest({
            kind: 'release-meta',
            releaseName: ' New Name ',
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
            document: {
                releaseName: 'New Name',
                items: [{ id: 'item-1', name: 'Task' }],
            },
        });
    });

    it('accepts manager patch save when baseVersion matches the same timestamp in a different format', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000+00:00',
                        content: createManagerDocument(),
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000+00:00' },
                    error: null,
                })),
            });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'item-fe-1', field: 'status', value: 'FE in progress' },
                { itemId: 'item-fe-1', field: 'quickNote', value: 'Working on it' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000+00:00',
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
                { itemId: 'item-fe-1', field: 'status', value: 'FE in progress' },
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

    it('accepts manager save on a direct sibling team row and keeps other team rows unchanged', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: createSiblingTeamDocument(),
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
                { itemId: 'team-fe', field: 'status', value: 'FE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload).toMatchObject({
            success: true,
            updatedAt: '2026-04-02T20:00:00.000Z',
        });
        expect(getTeamStatusFromDocument(payload.document, 'FE')).toBe('FE in progress');
        expect(getTeamStatusFromDocument(payload.document, 'BE')).toBe('None');
        expect(getTeamStatusFromDocument(payload.document, 'QC')).toBe('None');
    });

    it('rejects manager save when trying to edit another sibling team row', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        supabaseMock.from.mockReturnValueOnce({
            select: vi.fn(() => createSelectQuery({
                data: {
                    updated_at: '2026-04-02T19:59:00.000Z',
                    content: createSiblingTeamDocument(),
                },
                error: null,
            })),
        });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-be', field: 'status', value: 'BE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const payload = await response.json();
        expect(response.status).toBe(403);
        expect(payload.error).toBe('Permission denied');
        expect(Array.isArray(payload.violations)).toBe(true);
        expect(payload.violations[0]).toContain('không bao gồm FE');
    });

    it('accepts sequential manager saves across different sibling team rows when the second save uses the refreshed version', async () => {
        authenticateTeamRequestMock
            .mockResolvedValueOnce({
                sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
                member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
            })
            .mockResolvedValueOnce({
                sessionUser: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE' },
                member: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE', is_active: true },
            });

        const afterFeSave = createSiblingTeamDocument({ FE: 'FE in progress' });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: createSiblingTeamDocument(),
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000+00:00' },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T20:00:00.000+00:00',
                        content: afterFeSave,
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:01:00.000+00:00' },
                    error: null,
                })),
            });

        const firstResponse = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-fe', field: 'status', value: 'FE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const firstPayload = await firstResponse.json();
        expect(firstResponse.status).toBe(200);
        expect(firstPayload.updatedAt).toBe('2026-04-02T20:00:00.000+00:00');

        const secondResponse = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-be', field: 'status', value: 'BE in progress' },
            ],
            baseVersion: firstPayload.updatedAt,
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const secondPayload = await secondResponse.json();
        expect(secondResponse.status).toBe(200);
        expect(getTeamStatusFromDocument(secondPayload.document, 'FE')).toBe('FE in progress');
        expect(getTeamStatusFromDocument(secondPayload.document, 'BE')).toBe('BE in progress');
    });

    it('returns 409 when another manager save is already visible at the first read', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE' },
            member: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE', is_active: true },
        });

        supabaseMock.from.mockReturnValueOnce({
            select: vi.fn(() => createSelectQuery({
                data: {
                    updated_at: '2026-04-02T20:00:00.000Z',
                    content: createSiblingTeamDocument({ FE: 'FE in progress' }),
                },
                error: null,
            })),
        });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-be', field: 'status', value: 'BE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
            code: 'VERSION_MISMATCH',
            serverVersion: '2026-04-02T20:00:00.000Z',
        });
    });

    it('retries and preserves disjoint sibling team updates when stale is detected at write time', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE' },
            member: { email: 'be@example.com', role: 'manager', team: 'BE', label: 'BE', is_active: true },
        });

        const initialDocument = createSiblingTeamDocument();
        const afterFeSave = createSiblingTeamDocument({ FE: 'FE in progress' });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: initialDocument,
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: null,
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T20:00:00.000Z',
                        content: afterFeSave,
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:01:00.000Z' },
                    error: null,
                })),
            });

        const response = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-be', field: 'status', value: 'BE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(getTeamStatusFromDocument(payload.document, 'FE')).toBe('FE in progress');
        expect(getTeamStatusFromDocument(payload.document, 'BE')).toBe('BE in progress');
        expect(payload.updatedAt).toBe('2026-04-02T20:01:00.000Z');
    });

    it('accepts the same manager saving twice in a row when reusing the updated version from the first save', async () => {
        authenticateTeamRequestMock.mockResolvedValue({
            sessionUser: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE' },
            member: { email: 'fe@example.com', role: 'manager', team: 'FE', label: 'FE', is_active: true },
        });

        const afterFirstSave = createSiblingTeamDocument({ FE: 'FE in progress' });

        supabaseMock.from
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T19:59:00.000Z',
                        content: createSiblingTeamDocument(),
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:00:00.000+00:00' },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                select: vi.fn(() => createSelectQuery({
                    data: {
                        updated_at: '2026-04-02T20:00:00.000+00:00',
                        content: afterFirstSave,
                    },
                    error: null,
                })),
            })
            .mockReturnValueOnce({
                update: vi.fn(() => createUpdateQuery({
                    data: { updated_at: '2026-04-02T20:01:00.000+00:00' },
                    error: null,
                })),
            });

        const firstResponse = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-fe', field: 'status', value: 'FE in progress' },
            ],
            baseVersion: '2026-04-02T19:59:00.000Z',
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const firstPayload = await firstResponse.json();
        expect(firstResponse.status).toBe(200);

        const secondResponse = await managerSavePost(createRequest({
            changes: [
                { itemId: 'team-fe', field: 'status', value: 'FE Done' },
            ],
            baseVersion: firstPayload.updatedAt,
        }) as never, {
            params: Promise.resolve({ id: 'roadmap-1' }),
        });

        const secondPayload = await secondResponse.json();
        expect(secondResponse.status).toBe(200);
        expect(getTeamStatusFromDocument(secondPayload.document, 'FE')).toBe('FE Done');
        expect(secondPayload.updatedAt).toBe('2026-04-02T20:01:00.000+00:00');
    });
});
