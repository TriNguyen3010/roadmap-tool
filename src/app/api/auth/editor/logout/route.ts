import { NextResponse } from 'next/server';
import { EDITOR_SESSION_COOKIE } from '@/lib/editorAuth';

export async function POST() {
    const response = NextResponse.json({ success: true, isEditor: false });
    response.cookies.set({
        name: EDITOR_SESSION_COOKIE,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return response;
}
