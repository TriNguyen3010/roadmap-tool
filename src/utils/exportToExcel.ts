import * as XLSX from 'xlsx';
import { RoadmapDocument, RoadmapItem } from '@/types/roadmap';
import { format } from 'date-fns';

// ── Flatten roadmap tree into rows for Excel ──────────────────────────────────
interface ExcelRow {
    indent: number;
    id: string;
    name: string;
    type: string;
    status: string;
    progress: number;
    startDate: string;
    endDate: string;
}

function flattenForExcel(items: RoadmapItem[], indent = 0): ExcelRow[] {
    const rows: ExcelRow[] = [];
    for (const item of items) {
        rows.push({
            indent,
            id: item.id,
            name: ('  '.repeat(indent)) + item.name,
            type: item.type,
            status: item.status,
            progress: item.progress ?? 0,
            startDate: item.startDate ?? '',
            endDate: item.endDate ?? '',
        });
        if (item.children?.length) {
            rows.push(...flattenForExcel(item.children, indent + 1));
        }
    }
    return rows;
}

// ── Main export function ──────────────────────────────────────────────────────
export function exportRoadmapToExcel(data: RoadmapDocument): void {
    const rows = flattenForExcel(data.items);

    // Build worksheet data: header row + data rows
    const headers = ['ID', 'Tên', 'Loại', 'Trạng thái', 'Tiến độ (%)', 'Ngày bắt đầu', 'Ngày kết thúc'];

    const wsData: (string | number)[][] = [
        headers,
        ...rows.map(r => [
            r.id,
            r.name,
            r.type,
            r.status,
            r.progress,
            r.startDate,
            r.endDate,
        ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // ── Column widths ──
    ws['!cols'] = [
        { wch: 20 },  // ID
        { wch: 45 },  // Name (wide for indented text)
        { wch: 14 },  // Type
        { wch: 16 },  // Status
        { wch: 14 },  // Progress
        { wch: 14 },  // Start date
        { wch: 14 },  // End date
    ];

    // ── Freeze top row ──
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ── Cell styles (requires xlsx-style or manual approach) ──
    // SheetJS community edition doesn't support full cell styles,
    // but we can set bold via writeFileXLSX with a workaround:
    // We use the '!merges' and basic number format instead.
    // Progress column: format as percentage display
    for (let i = 1; i < wsData.length; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: 4 }); // Progress column
        if (ws[cellAddress]) {
            ws[cellAddress].t = 'n';
        }
    }

    // ── Create workbook ──
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roadmap');

    // ── Add milestones sheet if any ──
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

    // ── Download ──
    const fileName = `${data.releaseName ?? 'roadmap'}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

    // Explicitly write to array buffer and use Blob to trigger download.
    // This is more reliable in Next.js client environments than XLSX.writeFile.
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });

    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
