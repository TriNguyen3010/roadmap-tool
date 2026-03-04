import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import { EDITOR_SESSION_COOKIE, isEditorSessionValid } from '@/lib/editorAuth';

const execPromise = util.promisify(exec);

export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get(EDITOR_SESSION_COOKIE)?.value;
        if (!isEditorSessionValid(token)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cwd = process.cwd();
        // 1. Add changes from data folder
        await execPromise('git add data/roadmap.json', { cwd });

        // 2. Commit with automated message. Note: if no changes, it will fail the commit.
        try {
            await execPromise('git commit -m "Update roadmap data from Web GUI"', { cwd });
        } catch (e: unknown) {
            if (
                typeof e === 'object' &&
                e !== null &&
                'stdout' in e &&
                typeof (e as { stdout?: unknown }).stdout === 'string' &&
                (e as { stdout: string }).stdout.includes('nothing to commit')
            ) {
                return NextResponse.json({ success: true, message: 'No changes to commit' });
            }
            throw e;
        }

        // 3. Push to remote
        await execPromise('git push', { cwd });

        return NextResponse.json({ success: true, message: 'Pushed to Git repository' });
    } catch (error) {
        console.error('Git integration error:', error);
        return NextResponse.json({ error: 'Git push failed. Ensure git is configured properly.', details: String(error) }, { status: 500 });
    }
}
