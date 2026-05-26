'use client';

import { useEffect, useState } from 'react';
import { parseLastDump, type LastDump } from '@/utils/lastDump';

export function LocalBackupBanner() {
    const [dump, setDump] = useState<LastDump | null>(null);
    const [isLocal, setIsLocal] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') return;
        setIsLocal(true);

        fetch('/api/last-dump')
            .then(res => res.ok ? res.json() : null)
            .then((data: unknown) => {
                const parsed = parseLastDump(data);
                if (parsed) setDump(parsed);
            })
            .catch(() => {});
    }, []);

    if (!isLocal || !dump) return null;

    if (dump.kind === 'discovery_failed') {
        return (
            <div className="flex items-center justify-center gap-2 bg-red-50 border-b border-red-200 px-3 py-1 text-[11px] text-red-700">
                <span className="font-semibold">Local Backup:</span>
                <span>{dump.timestampLocal}</span>
                <span className="text-red-400">|</span>
                <span className="font-semibold">Discovery failed:</span>
                <span>{dump.error}</span>
            </div>
        );
    }

    if (dump.kind === 'legacy') {
        const ok = dump.status === 'success';
        return (
            <div className={`flex items-center justify-center gap-2 ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'} border-b px-3 py-1 text-[11px]`}>
                <span className="font-semibold">Local Backup:</span>
                <span>{dump.timestampLocal}</span>
                <span className="opacity-60">|</span>
                <span>{dump.fileSize}</span>
                <span className="opacity-60">|</span>
                <span>{dump.elapsed}</span>
                <span className="opacity-60">|</span>
                <span className="font-semibold">{ok ? 'OK' : dump.status}</span>
            </div>
        );
    }

    // aggregate
    const { summary, timestampLocal, elapsed } = dump;
    const hasFailed = summary.failed > 0;
    const bgClass = hasFailed
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700';

    return (
        <div className={`flex items-center justify-center gap-2 ${bgClass} border-b px-3 py-1 text-[11px]`}>
            <span className="font-semibold">Local Backup:</span>
            <span>{timestampLocal}</span>
            <span className="opacity-60">|</span>
            <span>{summary.success}/{summary.total} OK</span>
            {hasFailed && (
                <>
                    <span className="opacity-60">|</span>
                    <span className="font-semibold">{summary.failed} failed</span>
                </>
            )}
            <span className="opacity-60">|</span>
            <span>{elapsed}</span>
        </div>
    );
}
