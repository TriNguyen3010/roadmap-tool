'use client';

import { calcArcHeight } from '@/utils/timelineArc';

interface TimelineArcProps {
    startX: number;
    endX: number;
    color: string;
    rowHeight: number;
    isActive?: boolean;
    arcHeight?: number;
    forceDot?: boolean;
    strokeDasharray?: string;
}

export default function TimelineArc({
    startX,
    endX,
    color,
    rowHeight,
    isActive = false,
    arcHeight,
    forceDot = false,
    strokeDasharray,
}: TimelineArcProps) {
    const start = Math.min(startX, endX);
    const end = Math.max(startX, endX);
    const span = end - start;
    const baseline = rowHeight - 6;
    const dotRadius = isActive ? 3.4 : 3;
    const midX = (start + end) / 2;

    if (forceDot || span < 2) {
        return (
            <g opacity={isActive ? 1 : 0.9} pointerEvents="none">
                <circle
                    cx={midX}
                    cy={baseline}
                    r={isActive ? 4.8 : 4.2}
                    fill={color}
                />
            </g>
        );
    }

    const height = arcHeight ?? calcArcHeight(span, rowHeight);
    const controlY = Math.max(2, baseline - height);
    const pathD = `M ${start},${baseline} Q ${midX},${controlY} ${end},${baseline}`;

    return (
        <g
            opacity={isActive ? 1 : 0.88}
            pointerEvents="none"
            style={{ filter: isActive ? `drop-shadow(0 0 4px ${color}66)` : 'none' }}
        >
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={isActive ? 2.6 : 1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={strokeDasharray}
            />
            <circle cx={start} cy={baseline} r={dotRadius} fill={color} />
            <circle cx={end} cy={baseline} r={dotRadius} fill={color} />
        </g>
    );
}
