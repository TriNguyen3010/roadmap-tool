import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';
import { deleteImageByPublicId, isManagedCloudinaryPublicId } from '@/lib/cloudinary';
import { checkRateLimit, getRateLimitKey, readPositiveIntEnv } from '@/lib/rateLimit';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const DELETE_RATE_LIMIT_MAX = readPositiveIntEnv('IMAGE_DELETE_RATE_LIMIT_MAX', 20);
const DELETE_RATE_LIMIT_WINDOW_MS = readPositiveIntEnv('IMAGE_DELETE_RATE_LIMIT_WINDOW_MS', 60_000);

export async function POST(request: NextRequest) {
    const requestId = randomUUID();
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const key = getRateLimitKey(request, token);
        const rateLimitResult = checkRateLimit({
            scope: 'image-delete',
            key,
            limit: DELETE_RATE_LIMIT_MAX,
            windowMs: DELETE_RATE_LIMIT_WINDOW_MS,
        });

        if (!rateLimitResult.allowed) {
            const retryAfterSeconds = Math.max(1, Math.ceil(rateLimitResult.retryAfterMs / 1000));
            return NextResponse.json(
                { error: 'Too many delete requests. Please retry later.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(retryAfterSeconds),
                        'X-Request-Id': requestId,
                    },
                }
            );
        }

        const body = await request.json().catch(() => ({}));
        const imageIdRaw = typeof body?.imageId === 'string' ? body.imageId : '';
        const imageId = imageIdRaw.trim();

        if (!imageId) {
            return NextResponse.json({ error: 'imageId is required' }, { status: 400 });
        }

        if (!isManagedCloudinaryPublicId(imageId)) {
            return NextResponse.json({ error: 'imageId is not in managed folder' }, { status: 400 });
        }

        const result = await deleteImageByPublicId(imageId);
        return NextResponse.json({ success: true, result, requestId });
    } catch (error) {
        console.error(`[image-delete:${requestId}] failed`, error);
        return NextResponse.json({ error: 'Image delete failed', requestId, details: String(error) }, { status: 500 });
    }
}
