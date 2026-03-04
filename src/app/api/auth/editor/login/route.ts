import { NextRequest, NextResponse } from 'next/server';
import {
    createEditorSessionToken,
    EDITOR_SESSION_COOKIE,
    EDITOR_SESSION_TTL_SECONDS,
    isEditorPasswordValid,
} from '@/lib/editorAuth';

type LoginBody = {
    password?: string;
};

export async function POST(request: NextRequest) {
    let body: LoginBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const password = body.password || '';
    if (!isEditorPasswordValid(password)) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, isEditor: true });
    response.cookies.set({
        name: EDITOR_SESSION_COOKIE,
        value: createEditorSessionToken(),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: EDITOR_SESSION_TTL_SECONDS,
    });

    return response;
}
