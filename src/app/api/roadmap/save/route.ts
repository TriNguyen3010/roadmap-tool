import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const data = await request.json();
        const filePath = path.join(process.cwd(), 'data', 'roadmap.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to write roadmap data' }, { status: 500 });
    }
}
