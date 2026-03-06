import type { NextRequest } from 'next/server';

type RateBucket = {
    count: number;
    resetAt: number;
};

const bucketsByScope = new Map<string, Map<string, RateBucket>>();

const getScopeBuckets = (scope: string): Map<string, RateBucket> => {
    const existing = bucketsByScope.get(scope);
    if (existing) return existing;
    const created = new Map<string, RateBucket>();
    bucketsByScope.set(scope, created);
    return created;
};

export const getRequestIp = (request: NextRequest): string => {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        const first = forwardedFor.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
};

export const getRateLimitKey = (request: NextRequest, sessionToken?: string): string => {
    const ip = getRequestIp(request);
    if (!sessionToken) return `ip:${ip}`;
    const tokenSuffix = sessionToken.slice(-16);
    return `ip:${ip}:session:${tokenSuffix}`;
};

export const readPositiveIntEnv = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

export const checkRateLimit = ({
    scope,
    key,
    limit,
    windowMs,
}: {
    scope: string;
    key: string;
    limit: number;
    windowMs: number;
}): { allowed: boolean; remaining: number; retryAfterMs: number } => {
    const now = Date.now();
    const scopeBuckets = getScopeBuckets(scope);
    const bucket = scopeBuckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
        scopeBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return {
            allowed: true,
            remaining: Math.max(0, limit - 1),
            retryAfterMs: 0,
        };
    }

    if (bucket.count >= limit) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: Math.max(0, bucket.resetAt - now),
        };
    }

    bucket.count += 1;
    return {
        allowed: true,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterMs: 0,
    };
};

