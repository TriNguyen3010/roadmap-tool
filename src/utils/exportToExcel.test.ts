import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { RoadmapDocument } from '../types/roadmap';
import { buildRoadmapExcelFile } from './exportToExcel';
import { flattenRoadmap } from './roadmapHelpers';

function makeSampleRoadmap(): RoadmapDocument {
  return {
    releaseName: 'Roadmap Export',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    items: [
      {
        id: 'group-1',
        name: 'Group 1',
        type: 'group',
        status: 'DevOps in progress',
        progress: 30,
        quickNote: 'Main implementation note',
        children: [
          {
            id: 'item-1',
            name: 'Item 1',
            type: 'item',
            status: 'Not Started',
            progress: 0,
            quickNote: 'Line 1\nLine 2',
          },
        ],
      },
    ],
  };
}

function readRoadmapSheet(excelBuffer: ArrayBuffer): (string | number)[][] {
  const workbook = XLSX.read(excelBuffer, { type: 'array' });
  const sheet = workbook.Sheets.Roadmap;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as (string | number)[][];
}

describe('buildRoadmapExcelFile', () => {
  it('includes Note in full-data default columns', () => {
    const { excelBuffer } = buildRoadmapExcelFile(makeSampleRoadmap(), {
      mode: 'full-data',
      includeSummary: false,
    });

    const rows = readRoadmapSheet(excelBuffer);

    expect(rows[0]).toEqual([
      'ID',
      'Tên',
      'Note',
      'Loại',
      'Trạng thái',
      'Tiến độ (%)',
      'Ngày bắt đầu',
      'Ngày kết thúc',
    ]);
    expect(rows[1][2]).toBe('Main implementation note');
    expect(rows[2][2]).toBe('Line 1\nLine 2');
  });

  it('maps Note when provided as a current-view custom column', () => {
    const data = makeSampleRoadmap();
    const { excelBuffer } = buildRoadmapExcelFile(data, {
      mode: 'current-view',
      rows: flattenRoadmap(data.items),
      columns: [
        { id: 'id', header: 'ID' },
        { id: 'name', header: 'Tên' },
        { id: 'note', header: 'Note' },
      ],
      includeSummary: false,
    });

    const rows = readRoadmapSheet(excelBuffer);

    expect(rows[0]).toEqual(['ID', 'Tên', 'Note']);
    expect(rows[1]).toEqual(['group-1', 'Group 1', 'Main implementation note']);
    expect(rows[2]).toEqual(['item-1', '  Item 1', 'Line 1\nLine 2']);
  });
});
