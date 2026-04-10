'use client';

import { useEffect, useState } from 'react';

interface DumpInfo {
    timestamp: string;
    timestampLocal: string;
    roadmapId: string;
    status: string;
    fileSize: string;
    elapsed: string;
}

export function LocalBackupBanner() {
    const [dump, setDump] = useState<DumpInfo | null>(null);
    const [isLocal, setIsLocal] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') return;
        setIsLocal(true);

        fetch('/api/last-dump')
            .then(res => res.ok ? res.json() : null)
            .then((data: DumpInfo | null) => { if (data) setDump(data); })
            .catch(() => {});
    }, []);

    if (!isLocal || !dump) return null;

    return (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 border-b border-emerald-200 px-3 py-1 text-[11px] text-emerald-700">
            <span className="font-semibold">Local Backup:</span>
            <span>{dump.timestampLocal}</span>
            <span className="text-emerald-500">|</span>
            <span>{dump.fileSize}</span>
            <span className="text-emerald-500">|</span>
            <span>{dump.elapsed}</span>
            <span className="text-emerald-500">|</span>
            <span className={dump.status === 'success' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                {dump.status === 'success' ? 'OK' : dump.status}
            </span>
        </div>
    );
}
