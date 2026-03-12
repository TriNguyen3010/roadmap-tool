import path from 'path';
import { mkdir } from 'fs/promises';

const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileName(name: string, fallback: string): string {
    const base = (name || '').trim() || fallback;
    const cleaned = base.replace(INVALID_FILE_CHARS, '_').replace(/\s+/g, ' ');
    return cleaned || fallback;
}

export function buildTimestampTag(date = new Date()): string {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}${sec}`;
}

export function resolveStorageDir(envValue: string | undefined, fallbackRelativeDir: string): string {
    const resolved = envValue && envValue.trim()
        ? path.resolve(process.cwd(), envValue.trim())
        : path.resolve(process.cwd(), fallbackRelativeDir);
    return resolved;
}

export async function ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
}

export function toProjectRelativePath(absolutePath: string): string {
    return path.relative(process.cwd(), absolutePath) || '.';
}
