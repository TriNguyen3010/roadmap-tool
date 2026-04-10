import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'data', 'last-dump.json');
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ status: 'no-data', message: 'Chưa có backup nào' }, { status: 404 });
    }
}
