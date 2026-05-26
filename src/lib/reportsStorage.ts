import { supabase } from '@/lib/supabase';

const BUCKET = process.env.REPORT_STORAGE_BUCKET || 'reports';
const DOWNLOAD_TTL_SECONDS = 60;

export const uploadReportFile = async (params: {
    storagePath: string;
    buffer: Buffer;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(params.storagePath, params.buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: false, // storagePath contains a UUID; collision is astronomically unlikely
        });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
};

export const deleteReportFile = async (storagePath: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
};

export const createReportSignedUrl = async (storagePath: string): Promise<{ url: string } | { error: string }> => {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, DOWNLOAD_TTL_SECONDS);
    if (error || !data) return { error: error?.message || 'signed URL creation returned no data' };
    return { url: data.signedUrl };
};
