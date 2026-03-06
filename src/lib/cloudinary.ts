import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

const DEFAULT_UPLOAD_MAX_MB = 5;
const DEFAULT_UPLOAD_FOLDER = 'roadmap-tool/items';
const DEFAULT_ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
]);

let isConfigured = false;

const sanitizeSegment = (raw: string | undefined): string => {
    const value = (raw || 'item').trim().toLowerCase();
    const safe = value.replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return safe || 'item';
};

const sanitizeFolderPath = (raw: string | undefined): string => {
    const fallback = DEFAULT_UPLOAD_FOLDER;
    const value = (raw || fallback).trim();
    const segments = value
        .split('/')
        .map(segment => sanitizeSegment(segment))
        .filter(Boolean);
    return segments.length > 0 ? segments.join('/') : fallback;
};

const parseCloudinaryUrl = (cloudinaryUrl: string): { cloudName: string; apiKey: string; apiSecret: string } | null => {
    try {
        const parsed = new URL(cloudinaryUrl);
        if (parsed.protocol !== 'cloudinary:') return null;
        const cloudName = parsed.hostname;
        const apiKey = decodeURIComponent(parsed.username);
        const apiSecret = decodeURIComponent(parsed.password);
        if (!cloudName || !apiKey || !apiSecret) return null;
        return { cloudName, apiKey, apiSecret };
    } catch {
        return null;
    }
};

const getCloudinaryCredentials = (): { cloudName: string; apiKey: string; apiSecret: string } | null => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret };
    }

    const cloudinaryUrl = process.env.CLOUDINARY_URL;
    if (cloudinaryUrl) return parseCloudinaryUrl(cloudinaryUrl);
    return null;
};

export const ensureCloudinaryConfigured = (): void => {
    if (isConfigured) return;
    const creds = getCloudinaryCredentials();
    if (!creds) {
        throw new Error(
            'Cloudinary config is missing. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.'
        );
    }
    cloudinary.config({
        cloud_name: creds.cloudName,
        api_key: creds.apiKey,
        api_secret: creds.apiSecret,
        secure: true,
    });
    isConfigured = true;
};

export const isAllowedImageMimeType = (mimeType: string): boolean => {
    return ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
};

export const getUploadMaxBytes = (): number => {
    const maxMbRaw = Number(process.env.UPLOAD_MAX_MB || DEFAULT_UPLOAD_MAX_MB);
    const maxMb = Number.isFinite(maxMbRaw) && maxMbRaw > 0 ? maxMbRaw : DEFAULT_UPLOAD_MAX_MB;
    return Math.floor(maxMb * 1024 * 1024);
};

export const getUploadFolder = (): string => {
    return sanitizeFolderPath(process.env.CLOUDINARY_UPLOAD_FOLDER);
};

const getAllowedImageFormats = (): string[] => {
    const raw = process.env.CLOUDINARY_ALLOWED_IMAGE_FORMATS;
    if (!raw) return DEFAULT_ALLOWED_IMAGE_FORMATS;

    const parsed = raw
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(value => /^[a-z0-9]+$/.test(value));

    return parsed.length > 0 ? Array.from(new Set(parsed)) : DEFAULT_ALLOWED_IMAGE_FORMATS;
};

export const isManagedCloudinaryPublicId = (publicId: string): boolean => {
    const normalized = publicId.trim();
    if (!normalized) return false;
    const prefix = `${getUploadFolder()}/`;
    return normalized.startsWith(prefix);
};

export const uploadImageBuffer = async ({
    buffer,
    itemId,
    originalFilename,
}: {
    buffer: Buffer;
    itemId: string;
    originalFilename?: string;
}): Promise<UploadApiResponse> => {
    ensureCloudinaryConfigured();
    const safeItemId = sanitizeSegment(itemId);
    const folder = `${getUploadFolder()}/${safeItemId}`;
    const basename = sanitizeSegment(originalFilename?.split('.').slice(0, -1).join('.') || 'image');
    const publicId = `${basename}-${Date.now()}`;

    return await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'image',
                folder,
                public_id: publicId,
                overwrite: false,
                use_filename: false,
                unique_filename: false,
                invalidate: true,
                allowed_formats: getAllowedImageFormats(),
            },
            (error, result) => {
                if (error || !result) {
                    reject(error || new Error('Cloudinary upload failed'));
                    return;
                }
                resolve(result);
            }
        );
        stream.end(buffer);
    });
};

export const deleteImageByPublicId = async (publicId: string): Promise<string> => {
    ensureCloudinaryConfigured();
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    return typeof result.result === 'string' ? result.result : 'unknown';
};
