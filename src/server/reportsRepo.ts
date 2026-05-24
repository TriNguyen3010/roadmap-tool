import { supabase } from '@/lib/supabase';
import type { Report, ReportListItem } from '@/types/report';

type DbRow = {
    id: string;
    month: string;
    report_date: string;
    sprint_number: number | null;
    title: string;
    week_label: string | null;
    date_range: string | null;
    original_filename: string;
    original_storage_path: string;
    html_content: string;
    raw_text: string | null;
    uploaded_by: string | null;
    file_size_bytes: number;
    created_at: string;
    updated_at: string;
};

const toReport = (row: DbRow): Report => ({
    id: row.id,
    month: row.month,
    reportDate: row.report_date,
    sprintNumber: row.sprint_number,
    title: row.title,
    weekLabel: row.week_label,
    dateRange: row.date_range,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    htmlContent: row.html_content,
});

const toListItem = (row: Omit<DbRow, 'html_content' | 'raw_text' | 'original_storage_path'>): ReportListItem => ({
    id: row.id,
    month: row.month,
    reportDate: row.report_date,
    sprintNumber: row.sprint_number,
    title: row.title,
    weekLabel: row.week_label,
    dateRange: row.date_range,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const LIST_COLUMNS = 'id,month,report_date,sprint_number,title,week_label,date_range,original_filename,uploaded_by,file_size_bytes,created_at,updated_at';
const FULL_COLUMNS = `${LIST_COLUMNS},original_storage_path,html_content,raw_text`;

export const listMonths = async (): Promise<string[]> => {
    const { data, error } = await supabase
        .from('reports')
        .select('month')
        .order('month', { ascending: false });
    if (error) throw new Error(`listMonths: ${error.message}`);
    const unique = Array.from(new Set((data ?? []).map((r) => r.month as string)));
    return unique;
};

export const listReportsByMonth = async (month: string): Promise<ReportListItem[]> => {
    const { data, error } = await supabase
        .from('reports')
        .select(LIST_COLUMNS)
        .eq('month', month)
        .order('report_date', { ascending: false })
        .order('sprint_number', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listReportsByMonth: ${error.message}`);
    return (data ?? []).map((row) => toListItem(row as Omit<DbRow, 'html_content' | 'raw_text' | 'original_storage_path'>));
};

export const getReportById = async (id: string): Promise<Report | null> => {
    const { data, error } = await supabase
        .from('reports')
        .select(FULL_COLUMNS)
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`getReportById: ${error.message}`);
    if (!data) return null;
    return toReport(data as DbRow);
};

export const getReportStoragePath = async (id: string): Promise<string | null> => {
    const { data, error } = await supabase
        .from('reports')
        .select('original_storage_path')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`getReportStoragePath: ${error.message}`);
    return (data?.original_storage_path as string | undefined) ?? null;
};

export const insertReport = async (input: Omit<Report, 'id' | 'createdAt' | 'updatedAt'> & {
    originalStoragePath: string;
    rawText: string | null;
}): Promise<Report> => {
    const { data, error } = await supabase
        .from('reports')
        .insert({
            month: input.month,
            report_date: input.reportDate,
            sprint_number: input.sprintNumber,
            title: input.title,
            week_label: input.weekLabel,
            date_range: input.dateRange,
            original_filename: input.originalFilename,
            original_storage_path: input.originalStoragePath,
            html_content: input.htmlContent,
            raw_text: input.rawText,
            uploaded_by: input.uploadedBy,
            file_size_bytes: input.fileSizeBytes,
        })
        .select(FULL_COLUMNS)
        .single();
    if (error || !data) throw new Error(`insertReport: ${error?.message || 'no data'}`);
    return toReport(data as DbRow);
};

export const deleteReport = async (id: string): Promise<{ storagePath: string } | null> => {
    const { data, error } = await supabase
        .from('reports')
        .delete()
        .eq('id', id)
        .select('original_storage_path')
        .maybeSingle();
    if (error) throw new Error(`deleteReport: ${error.message}`);
    if (!data) return null;
    return { storagePath: (data as { original_storage_path: string }).original_storage_path };
};
