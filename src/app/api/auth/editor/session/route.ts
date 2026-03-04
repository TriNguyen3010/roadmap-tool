import { NextRequest, NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';

export async function GET(request: NextRequest) {
    const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
    return NextResponse.json({ isEditor: isEditorSessionValid(token) });
}
