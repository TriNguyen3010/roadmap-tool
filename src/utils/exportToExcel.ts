import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import {
    normalizeItemPriority,
    normalizePhaseIds,
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
    columns?: ExcelExportColumn[];
    includeSummary?: boolean;
}

interface SummaryRow {
    featureName: string;
    groupName: string;
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

function buildPhaseLabelById(data: RoadmapDocument): Map<string, string> {
    const labelMap = new Map<string, string>();
    (data.milestones || []).forEach((milestone, index) => {
        const id = (milestone.id || '').trim() || `phase_${index + 1}`;
        const label = (milestone.label || '').trim() || `Phase ${index + 1}`;
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
    teamPd: SummaryRow[];
} {
    const rowById = buildRowById(rows);
    const descendantTeamRolesByAncestorId = buildDescendantTeamRolesByAncestorId(rows);
    const isDevInProgress = (row: FlattenedItem) => row.status === 'Dev In Progress';
    const isPdInProgress = (row: FlattenedItem) => row.status === 'PD In Progress';

    const app = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'App'))
        .filter(isDevInProgress)
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
        }));

    const core = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'Core'))
        .filter(isDevInProgress)
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
        }));

    const web = rows
        .filter(row => row.type === 'group' && isUnderSubcategory(row, rowById, 'Web'))
        .filter(isDevInProgress)
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
        }));

    const teamPd = rows
        .filter(row => row.type === 'item')
        .filter(row => descendantTeamRolesByAncestorId.get(row.id)?.has('PD'))
        .filter(isPdInProgress)
        .map(row => ({
            featureName: row.name,
            groupName: getSummaryGroupName(row, rowById),
        }));

    return { app, core, web, teamPd };
}

function buildSummarySheetData(rows: FlattenedItem[]): (string | number)[][] {
    const blocks = buildSummaryRowsByObject(rows);
    const data: (string | number)[][] = [];

    const buildSummaryContent = (entry: SummaryRow): string => (
        entry.groupName && entry.groupName !== '—'
            ? `${entry.groupName}: ${entry.featureName}`
            : entry.featureName
    );

    const appendBlock = (title: string, entries: SummaryRow[], startIndex = 1): number => {
        data.push([title, '']);
        data.push([...SUMMARY_HEADERS]);
        if (entries.length === 0) {
            data.push(['Không có dữ liệu', '']);
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
    appendBlock('Team PD (Product Design)', blocks.teamPd, 1);
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

export function exportRoadmapToExcel(data: RoadmapDocument, options?: ExportRoadmapToExcelOptions): void {
    const mode: 'current-view' | 'full-data' = options?.mode
        ?? ((options?.rows || options?.columns) ? 'current-view' : 'full-data');
    const rows = options?.rows ?? flattenRoadmap(data.items);
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
        const summaryData = buildSummarySheetData(rows);
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [
            { wch: 8 },
            { wch: 92 },
        ];
        XLSX.utils.book_append_sheet(wb, summaryWs, SUMMARY_SHEET_NAME);
    }

    if (data.milestones?.length) {
        const msHeaders = ['ID', 'Tên Milestone', 'Ngày bắt đầu', 'Ngày kết thúc', 'Màu'];
        const msData = [
            msHeaders,
            ...data.milestones.map(m => [m.id, m.label, m.startDate, m.endDate, m.color]),
        ];
        const msWs = XLSX.utils.aoa_to_sheet(msData);
        msWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, msWs, 'Milestones');
    }

    const modeSuffix = mode === 'current-view' ? 'current-view' : 'full-data';
    const fileName = `${data.releaseName ?? 'roadmap'}_${modeSuffix}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });

    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
