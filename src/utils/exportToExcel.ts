import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import {
    TEAM_ROLES,
    TeamRole,
    normalizeItemPriority,
    normalizePhaseIds,
    normalizeWeekLabel,
    RoadmapDocument,
} from '@/types/roadmap';
import { flattenRoadmap, FlattenedItem } from '@/utils/roadmapHelpers';

export type ExcelExportColumnId =
    | 'id'
    | 'name'
    | 'note'
    | 'type'
    | 'workType'
    | 'priority'
    | 'version'
    | 'status'
    | 'phase'
    | 'progress'
    | 'startDate'
    | 'endDate';

export interface ExcelExportColumn {
    id: ExcelExportColumnId;
    header: string;
    width?: number;
}

export interface ExportRoadmapToExcelOptions {
    mode?: 'current-view' | 'full-data';
    rows?: FlattenedItem[];
    summaryRows?: FlattenedItem[];
    columns?: ExcelExportColumn[];
    includeSummary?: boolean;
}

export interface BuiltRoadmapExcelFile {
    fileName: string;
    excelBuffer: ArrayBuffer;
}


interface TeamSummaryRow {
    feature: string;
    task: string;
    status: string;
    startDate: string;
    endDate: string;
}

const DEFAULT_COLUMN_WIDTH: Record<ExcelExportColumnId, number> = {
    id: 20,
    name: 45,
    note: 52,
    type: 14,
    workType: 16,
    priority: 12,
    version: 14,
    status: 16,
    phase: 24,
    progress: 14,
    startDate: 14,
    endDate: 14,
};

const LEGACY_COLUMNS: ExcelExportColumn[] = [
    { id: 'id', header: 'ID' },
    { id: 'name', header: 'Name' },
    { id: 'note', header: 'Note' },
    { id: 'type', header: 'Type' },
    { id: 'status', header: 'Status' },
    { id: 'progress', header: 'Progress (%)' },
    { id: 'startDate', header: 'Start Date' },
    { id: 'endDate', header: 'End Date' },
];

const TEAM_SUMMARY_SHEET_NAME = 'Team Summary';
const TEAM_SUMMARY_HEADERS = ['#', 'Feature', 'Task', 'Status', 'Start', 'End'];

function sanitizeFileBaseName(name: string | undefined): string {
    const fallback = 'roadmap';
    if (!name) return fallback;
    const cleaned = name
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ');
    return cleaned || fallback;
}

function buildPhaseLabelById(data: RoadmapDocument): Map<string, string> {
    const labelMap = new Map<string, string>();
    (data.milestones || []).forEach((milestone, index) => {
        const id = (milestone.id || '').trim() || `phase_${index + 1}`;
        const label = normalizeWeekLabel(milestone.label, index);
        labelMap.set(id, label);
    });
    return labelMap;
}

function buildIndentedName(row: FlattenedItem): string {
    return `${'  '.repeat(row.depth)}${row.name}`;
}

function buildRowById(rows: FlattenedItem[]): Map<string, FlattenedItem> {
    return new Map(rows.map(row => [row.id, row]));
}

function findAncestorByType(
    row: FlattenedItem,
    rowById: Map<string, FlattenedItem>,
    targetType: 'category' | 'subcategory' | 'group' | 'item'
): FlattenedItem | undefined {
    for (let i = row.parentIds.length - 1; i >= 0; i--) {
        const ancestor = rowById.get(row.parentIds[i]);
        if (ancestor?.type === targetType) return ancestor;
    }
    return undefined;
}

function getTeamFeatureName(row: FlattenedItem, rowById: Map<string, FlattenedItem>): string {
    const groupAncestor = findAncestorByType(row, rowById, 'group');
    return groupAncestor?.name || '—';
}

function getTeamTaskName(row: FlattenedItem, rowById: Map<string, FlattenedItem>): string {
    const itemAncestor = findAncestorByType(row, rowById, 'item');
    return itemAncestor?.name || '—';
}

function buildTeamSummaryByRole(rows: FlattenedItem[]): Map<TeamRole, TeamSummaryRow[]> {
    const rowById = buildRowById(rows);
    const result = new Map<TeamRole, TeamSummaryRow[]>();

    for (const role of TEAM_ROLES) {
        result.set(role, []);
    }

    for (const row of rows) {
        if (row.type !== 'team' || !row.teamRole) continue;
        const entries = result.get(row.teamRole as TeamRole);
        if (!entries) continue;
        entries.push({
            feature: getTeamFeatureName(row, rowById),
            task: getTeamTaskName(row, rowById),
            status: row.status || 'None',
            startDate: row.startDate || '-',
            endDate: row.endDate || '-',
        });
    }

    return result;
}

function buildTeamSummarySheetData(rows: FlattenedItem[]): (string | number)[][] {
    const teamData = buildTeamSummaryByRole(rows);
    const data: (string | number)[][] = [];

    // Report timestamp header
    data.push([`Report generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`]);
    data.push([]);

    for (const role of TEAM_ROLES) {
        const entries = teamData.get(role) || [];
        data.push([`Team ${role}`]);
        data.push([...TEAM_SUMMARY_HEADERS]);
        if (entries.length === 0) {
            data.push(['', 'No data', '', '', '', '']);
        } else {
            entries.forEach((entry, index) => {
                data.push([index + 1, entry.feature, entry.task, entry.status, entry.startDate, entry.endDate]);
            });
        }
        data.push([]);
    }

    return data;
}

function getCellValue(
    row: FlattenedItem,
    columnId: ExcelExportColumnId,
    phaseLabelById: Map<string, string>,
    respectCurrentViewRules: boolean
): string | number {
    switch (columnId) {
        case 'id':
            return row.id;
        case 'name':
            return buildIndentedName(row);
        case 'note':
            return row.quickNote || '';
        case 'type':
            return row.type;
        case 'workType':
            return row.type === 'group' ? (row.groupItemType || '—') : '';
        case 'priority': {
            if (row.type !== 'group' && row.type !== 'item') return '';
            return normalizeItemPriority(row.priority) || '—';
        }
        case 'version':
            return row.type === 'group' ? (row.version || '—') : '';
        case 'status':
            if (respectCurrentViewRules && (row.type === 'category' || row.type === 'subcategory')) return '';
            return row.status;
        case 'phase': {
            const labels = normalizePhaseIds(row.phaseIds).map(phaseId => phaseLabelById.get(phaseId) || 'Unknown');
            return labels.length > 0 ? labels.join(', ') : '—';
        }
        case 'progress':
            return row.progress ?? 0;
        case 'startDate':
            return row.startDate || '';
        case 'endDate':
            return row.endDate || '';
        default:
            return '';
    }
}

export function downloadExcelFile(buffer: ArrayBuffer, fileName: string): void {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function buildRoadmapExcelFile(data: RoadmapDocument, options?: ExportRoadmapToExcelOptions): BuiltRoadmapExcelFile {
    const mode: 'current-view' | 'full-data' = options?.mode
        ?? ((options?.rows || options?.columns) ? 'current-view' : 'full-data');
    const rows = options?.rows ?? flattenRoadmap(data.items);
    const summaryRows = options?.summaryRows ?? rows;
    const columns = options?.columns && options.columns.length > 0 ? options.columns : LEGACY_COLUMNS;
    const includeSummary = options?.includeSummary ?? (mode === 'current-view');
    const phaseLabelById = buildPhaseLabelById(data);
    const respectCurrentViewRules = mode === 'current-view';

    const wsData: (string | number)[][] = [
        columns.map(col => col.header),
        ...rows.map(row => columns.map(col => getCellValue(row, col.id, phaseLabelById, respectCurrentViewRules))),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = columns.map(col => ({
        wch: col.width ?? DEFAULT_COLUMN_WIDTH[col.id] ?? 14,
    }));

    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const progressColumnIndex = columns.findIndex(col => col.id === 'progress');
    if (progressColumnIndex >= 0) {
        for (let rowIndex = 1; rowIndex < wsData.length; rowIndex++) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: progressColumnIndex });
            if (ws[cellAddress]) {
                ws[cellAddress].t = 'n';
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roadmap');

    if (includeSummary) {
        const summaryData = buildTeamSummarySheetData(summaryRows);
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [
            { wch: 5 },   // #
            { wch: 45 },  // Feature
            { wch: 40 },  // Task
            { wch: 20 },  // Status
            { wch: 12 },  // Start
            { wch: 12 },  // End
        ];
        XLSX.utils.book_append_sheet(wb, summaryWs, TEAM_SUMMARY_SHEET_NAME);
    }

    if (data.milestones?.length) {
        const msHeaders = ['ID', 'Week Name', 'Start Date', 'End Date', 'Color'];
        const msData = [
            msHeaders,
            ...data.milestones.map(m => [m.id, m.label, m.startDate, m.endDate, m.color]),
        ];
        const msWs = XLSX.utils.aoa_to_sheet(msData);
        msWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, msWs, 'Weeks');
    }

    const modeSuffix = mode === 'current-view' ? 'team-summary' : 'full-data';
    const baseName = sanitizeFileBaseName(data.releaseName);
    const fileName = `${baseName}_${modeSuffix}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    return { fileName, excelBuffer };
}
