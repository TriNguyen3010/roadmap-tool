import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import {
    ItemStatus,
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
    | 'type'
    | 'workType'
    | 'priority'
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

type WindowWithFilePicker = Window & {
    showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
        }>;
    }) => Promise<{
        createWritable: () => Promise<{
            write: (data: ArrayBuffer | Blob | Uint8Array) => Promise<void>;
            close: () => Promise<void>;
        }>;
    }>;
};

interface SummaryRow {
    featureName: string;
    groupName: string;
    status: ItemStatus;
}

const DEFAULT_COLUMN_WIDTH: Record<ExcelExportColumnId, number> = {
    id: 20,
    name: 45,
    type: 14,
    workType: 16,
    priority: 12,
    status: 16,
    phase: 24,
    progress: 14,
    startDate: 14,
    endDate: 14,
};

const LEGACY_COLUMNS: ExcelExportColumn[] = [
    { id: 'id', header: 'ID' },
    { id: 'name', header: 'Tên' },
    { id: 'type', header: 'Loại' },
    { id: 'status', header: 'Trạng thái' },
    { id: 'progress', header: 'Tiến độ (%)' },
    { id: 'startDate', header: 'Ngày bắt đầu' },
    { id: 'endDate', header: 'Ngày kết thúc' },
];

const SUMMARY_SHEET_NAME = 'Summary by Object';
const SUMMARY_HEADERS = ['ID', 'Nội dung'];
const SUMMARY_GROUP_STATUSES: ItemStatus[] = ['Dev Handle', 'Dev In Progress', 'Not Started', 'Done'];
const SUMMARY_DEV_TEAM_STATUSES: ItemStatus[] = ['Dev Handle', 'Dev In Progress', 'Done'];
const SUMMARY_BA_STATUSES: ItemStatus[] = ['BA Handle', 'BA In Progress'];
const SUMMARY_PD_STATUSES: ItemStatus[] = ['PD Handle', 'PD In Progress'];
const SUMMARY_QC_STATUSES: ItemStatus[] = ['QC Handle', 'QC In Progress'];
const SUMMARY_GROWTH_STATUSES: ItemStatus[] = ['Growth Handle', 'Growth In Progress'];

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
    targetType: 'category' | 'subcategory' | 'group'
): FlattenedItem | undefined {
    for (let i = row.parentIds.length - 1; i >= 0; i--) {
        const ancestor = rowById.get(row.parentIds[i]);
        if (ancestor?.type === targetType) return ancestor;
    }
    return undefined;
}

function isUnderSubcategory(
    row: FlattenedItem,
    rowById: Map<string, FlattenedItem>,
    subcategoryName: string
): boolean {
    const ancestorSubcategory = findAncestorByType(row, rowById, 'subcategory');
    if (!ancestorSubcategory) return false;
    return ancestorSubcategory.name.trim().toLowerCase() === subcategoryName.trim().toLowerCase();
}

function getSummaryGroupName(row: FlattenedItem, rowById: Map<string, FlattenedItem>): string {
    const categoryAncestor = findAncestorByType(row, rowById, 'category');
    if (categoryAncestor) return categoryAncestor.name;

    if (row.type === 'group') return row.name;
    const groupAncestor = findAncestorByType(row, rowById, 'group');
    if (groupAncestor) return groupAncestor.name;
    return '—';
}

function buildDescendantTeamRolesByAncestorId(rows: FlattenedItem[]): Map<string, Set<string>> {
    const teamRolesByAncestor = new Map<string, Set<string>>();
    for (const row of rows) {
        if (row.type !== 'team' || !row.teamRole) continue;
        for (const ancestorId of row.parentIds) {
            const roleSet = teamRolesByAncestor.get(ancestorId) || new Set<string>();
            roleSet.add(row.teamRole);
            teamRolesByAncestor.set(ancestorId, roleSet);
        }
    }
    return teamRolesByAncestor;
}

function buildSummaryRowsByObject(rows: FlattenedItem[]): {
    app: SummaryRow[];
    core: SummaryRow[];
    web: SummaryRow[];
    teamBa: SummaryRow[];
    teamPd: SummaryRow[];
    teamDev: SummaryRow[];
    teamQc: SummaryRow[];
    teamGrowth: SummaryRow[];
} {
    const rowById = buildRowById(rows);
    const descendantTeamRolesByAncestorId = buildDescendantTeamRolesByAncestorId(rows);
    const matchesStatuses = (row: FlattenedItem, statuses: ItemStatus[]) => statuses.includes(row.status);
    const hasDescendantTeamRole = (row: FlattenedItem, roles: TeamRole[]) => {
        const roleSet = descendantTeamRolesByAncestorId.get(row.id);
        if (!roleSet) return false;
        return roles.some(role => roleSet.has(role));
    };

    const app = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'App'))
        .filter(row => matchesStatuses(row, SUMMARY_GROUP_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const core = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'Core'))
        .filter(row => matchesStatuses(row, SUMMARY_GROUP_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const web = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'Web'))
        .filter(row => matchesStatuses(row, SUMMARY_GROUP_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const teamBa = rows
        .filter(row => row.type === 'item')
        .filter(row => hasDescendantTeamRole(row, ['BA']))
        .filter(row => matchesStatuses(row, SUMMARY_BA_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const teamPd = rows
        .filter(row => row.type === 'item')
        .filter(row => hasDescendantTeamRole(row, ['PD']))
        .filter(row => matchesStatuses(row, SUMMARY_PD_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const teamDev = rows
        .filter(row => row.type === 'item')
        .filter(row => hasDescendantTeamRole(row, ['BE', 'FE']))
        .filter(row => matchesStatuses(row, SUMMARY_DEV_TEAM_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const teamQc = rows
        .filter(row => row.type === 'item')
        .filter(row => hasDescendantTeamRole(row, ['QC']))
        .filter(row => matchesStatuses(row, SUMMARY_QC_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    const teamGrowth = rows
        .filter(row => row.type === 'item')
        .filter(row => hasDescendantTeamRole(row, ['Growth']))
        .filter(row => matchesStatuses(row, SUMMARY_GROWTH_STATUSES))
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
            status: row.status,
        }));

    return { app, core, web, teamBa, teamPd, teamDev, teamQc, teamGrowth };
}

function buildSummarySheetData(rows: FlattenedItem[]): (string | number)[][] {
    const blocks = buildSummaryRowsByObject(rows);
    const data: (string | number)[][] = [];

    const buildSummaryContent = (entry: SummaryRow): string => (
        entry.groupName && entry.groupName !== '—'
            ? `${entry.groupName}: ${entry.featureName} - [${entry.status}]`
            : `${entry.featureName} - [${entry.status}]`
    );

    const appendBlock = (title: string, entries: SummaryRow[], startIndex = 1): number => {
        data.push([title, '']);
        data.push([...SUMMARY_HEADERS]);
        if (entries.length === 0) {
            data.push(['', 'Không có dữ liệu']);
        } else {
            entries.forEach((entry, index) => {
                data.push([startIndex + index, buildSummaryContent(entry)]);
            });
        }
        data.push([]);
        return startIndex + entries.length;
    };

    const nextAfterApp = appendBlock('App (Mobile)', blocks.app, 1);
    appendBlock('Core', blocks.core, nextAfterApp);
    appendBlock('Web', blocks.web, 1);
    appendBlock('Team BA', blocks.teamBa, 1);
    appendBlock('Team PD (Product Design)', blocks.teamPd, 1);
    appendBlock('Team Dev', blocks.teamDev, 1);
    appendBlock('Team QC', blocks.teamQc, 1);
    appendBlock('Team Growth', blocks.teamGrowth, 1);
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
        case 'type':
            return row.type;
        case 'workType':
            return row.type === 'group' ? (row.groupItemType || '—') : '';
        case 'priority': {
            if (row.type !== 'group' && row.type !== 'item') return '';
            return normalizeItemPriority(row.priority) || '—';
        }
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

export async function exportRoadmapToExcel(data: RoadmapDocument, options?: ExportRoadmapToExcelOptions): Promise<boolean> {
    const { fileName, excelBuffer } = buildRoadmapExcelFile(data, options);

    const windowWithFilePicker = window as WindowWithFilePicker;
    if (typeof windowWithFilePicker.showSaveFilePicker === 'function') {
        try {
            const handle = await windowWithFilePicker.showSaveFilePicker({
                suggestedName: fileName,
                types: [
                    {
                        description: 'Excel Workbook',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                        },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(excelBuffer);
            await writable.close();
            return true;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return false;
            }
        }
    }

    try {
        const wb = XLSX.read(excelBuffer, { type: 'array' });
        XLSX.writeFile(wb, fileName, { compression: true });
        return true;
    } catch {
        // Fallback to Blob download if writeFile is blocked/unavailable.
    }

    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    return true;
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
        const summaryData = buildSummarySheetData(summaryRows);
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [
            { wch: 28 },
            { wch: 100 },
        ];
        XLSX.utils.book_append_sheet(wb, summaryWs, SUMMARY_SHEET_NAME);
    }

    if (data.milestones?.length) {
        const msHeaders = ['ID', 'Tên Week', 'Ngày bắt đầu', 'Ngày kết thúc', 'Màu'];
        const msData = [
            msHeaders,
            ...data.milestones.map(m => [m.id, m.label, m.startDate, m.endDate, m.color]),
        ];
        const msWs = XLSX.utils.aoa_to_sheet(msData);
        msWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, msWs, 'Weeks');
    }

    const modeSuffix = mode === 'current-view' ? 'current-view' : 'full-data';
    const baseName = sanitizeFileBaseName(data.releaseName);
    const fileName = `${baseName}_${modeSuffix}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    return { fileName, excelBuffer };
}
