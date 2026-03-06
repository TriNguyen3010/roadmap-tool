import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';
import { getUploadMaxBytes, isAllowedImageMimeType, uploadImageBuffer } from '@/lib/cloudinary';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        });
    } catch (error) {
        console.error('Image upload failed:', error);
        return NextResponse.json({ error: 'Image upload failed', details: String(error) }, { status: 500 });
    }
}
