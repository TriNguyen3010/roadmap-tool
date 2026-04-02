import type { ItemStatus, TeamRole as RoadmapTeamRole } from '@/types/roadmap';

export type ItemId = string;
export type UserRole = 'admin' | 'manager' | 'viewer';
export type AuthAdminTeam = 'SepVinh' | 'PM';
export type AuthManagerTeam = RoadmapTeamRole;
export type AuthTeam = AuthAdminTeam | AuthManagerTeam;

export const ADMIN_LEVEL_TEAMS: readonly AuthAdminTeam[] = ['SepVinh', 'PM'];

export interface SessionUser {
    email: string;
    role: UserRole;
    team: AuthTeam | null;
    label: string;
}

export interface TeamMemberRecord {
    email: string;
    role: Exclude<UserRole, 'viewer'>;
    team: AuthTeam | null;
    label: string;
    is_active: boolean;
}

export interface EditPermission {
    canEditStatus: boolean;
    canEditDates: boolean;
    canEditNotes: boolean;
    canEditStructure: boolean;
    canEditMilestones: boolean;
    canManageRoadmap: boolean;
}

export function isAdminLevel(user: SessionUser | null): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === 'manager'
        && !!user.team
        && ADMIN_LEVEL_TEAMS.includes(user.team as AuthAdminTeam);
}

export function isManagerLevel(user: SessionUser | null): user is SessionUser & { role: 'manager'; team: AuthTeam } {
    return !!user && user.role === 'manager' && !!user.team;
}

export type ManagerFieldChange =
    | { itemId: ItemId; team?: RoadmapTeamRole; field: 'status'; value: ItemStatus }
    | { itemId: ItemId; team?: RoadmapTeamRole; field: 'startDate' | 'endDate'; value: string | null }
    | { itemId: ItemId; team?: RoadmapTeamRole; field: 'quickNote'; value: string | null };
