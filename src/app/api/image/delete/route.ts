import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';
import { deleteImageByPublicId } from '@/lib/cloudinary';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const imageIdRaw = typeof body?.imageId === 'string' ? body.imageId : '';
        const imageId = imageIdRaw.trim();

        if (!imageId) {
            return NextResponse.json({ error: 'imageId is required' }, { status: 400 });
        }

        const result = await deleteImageByPublicId(imageId);
        return NextResponse.json({ success: true, result });
    } catch (error) {
        console.error('Image delete failed:', error);
        return NextResponse.json({ error: 'Image delete failed', details: String(error) }, { status: 500 });
    }
}
