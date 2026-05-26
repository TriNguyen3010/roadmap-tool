'use client';

import { useEffect, useState } from 'react';
import { parseLastDump, type RoadmapBackup } from '@/utils/lastDump';

interface Props {
    roadmapId: string;
}

export function RoadmapBackupInfo({ roadmapId }: Props) {
    const [entry, setEntry] = useState<RoadmapBackup | null>(null);
    const [isLocal, setIsLocal] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') return;
        setIsLocal(true);

        fetch('/api/last-dump')
            .then(res => res.ok ? res.json() : null)
            .then((data: unknown) => {
                const parsed = parseLastDump(data);
                if (!parsed) return;
                if (parsed.kind === 'aggregate') {
                    const found = parsed.roadmaps.find(r => r.roadmapId === roadmapId);
                    if (found) setEntry(found);
                } else if (parsed.kind === 'legacy' && parsed.roadmapId === roadmapId) {
                    setEntry({
                        roadmapId: parsed.roadmapId,
                        releaseName: '',
                        status: parsed.status === 'success' ? 'success' : 'failed',
                        fileSize: parsed.fileSize,
                        elapsed: parsed.elapsed,
                    });
                }
            })
            .catch(() => {});
    }, [roadmapId]);

    if (!isLocal || !entry) return null;

    const ok = entry.status === 'success';
    const cls = ok
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-red-50 border-red-200 text-red-700';

    return (
        <div className={`flex items-center justify-center gap-2 ${cls} border-b px-3 py-1 text-[11px]`}>
            <span className="font-semibold">This roadmap backup:</span>
            {entry.fileSize && <span>{entry.fileSize}</span>}
            {entry.fileSize && <span className="opacity-60">|</span>}
            {entry.elapsed && <span>{entry.elapsed}</span>}
            {entry.elapsed && <span className="opacity-60">|</span>}
            <span className="font-semibold">{ok ? 'OK' : (entry.error || 'failed')}</span>
        </div>
    );
}
