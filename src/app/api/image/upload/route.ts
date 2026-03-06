import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';
import { getUploadMaxBytes, isAllowedImageMimeType, uploadImageBuffer } from '@/lib/cloudinary';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const UPLOAD_RATE_LIMIT_MAX = readPositiveIntEnv('IMAGE_UPLOAD_RATE_LIMIT_MAX', 20);
const UPLOAD_RATE_LIMIT_WINDOW_MS = readPositiveIntEnv('IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS', 60_000);

export async function POST(request: NextRequest) {
    const requestId = randomUUID();
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const key = getRateLimitKey(request, token);
        const rateLimitResult = checkRateLimit({
            scope: 'image-upload',
            key,
            limit: UPLOAD_RATE_LIMIT_MAX,
            windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
        });

        if (!rateLimitResult.allowed) {
            const retryAfterSeconds = Math.max(1, Math.ceil(rateLimitResult.retryAfterMs / 1000));
            return NextResponse.json(
                { error: 'Too many upload requests. Please retry later.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(retryAfterSeconds),
                        'X-Request-Id': requestId,
                    },
                }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const itemIdRaw = String(formData.get('itemId') || '').trim();
        const itemId = itemIdRaw || 'unknown-item';

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        if (!isAllowedImageMimeType(file.type)) {
            return NextResponse.json({ error: 'Unsupported image type. Allowed: jpg, png, webp.' }, { status: 400 });
        }

        const maxBytes = getUploadMaxBytes();
        if (file.size > maxBytes) {
            const maxMb = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
            return NextResponse.json({ error: `Image exceeds ${maxMb}MB limit.` }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploaded = await uploadImageBuffer({
            buffer,
            itemId,
            originalFilename: file.name,
        });

        return NextResponse.json({
            success: true,
            imageUrl: uploaded.secure_url,
            imageId: uploaded.public_id,
            imageProvider: 'cloudinary',
            imageName: file.name,
            bytes: uploaded.bytes,
            requestId,
        });
    } catch (error) {
        console.error(`[image-upload:${requestId}] failed`, error);
        return NextResponse.json({ error: 'Image upload failed', requestId, details: String(error) }, { status: 500 });
    }
}
