import crypto from 'crypto';

export const EDITOR_SESSION_COOKIE = 'roadmap_editor_session';
export const EDITOR_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const DEFAULT_EDITOR_PASSWORD = '889998';

const getEditorPassword = (): string => {
    return process.env.EDITOR_PASSWORD || DEFAULT_EDITOR_PASSWORD;
};

const getSessionSecret = (): string => {
    // Fallback to editor password so local setup works without extra env.
    return process.env.EDITOR_SESSION_SECRET || getEditorPassword();
};

const safeEqual = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (payload: string): string => {
    return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
};

export const isEditorPasswordValid = (password: string): boolean => {
    return safeEqual(password, getEditorPassword());
};

export const createEditorSessionToken = (expiresAt: number = Date.now() + EDITOR_SESSION_TTL_SECONDS * 1000): string => {
    const payload = String(expiresAt);
    const signature = signPayload(payload);
    return `${payload}.${signature}`;
};

export const isEditorSessionValid = (token: string | undefined): boolean => {
    if (!token) return false;

    const [expiresAtRaw, signature, ...rest] = token.split('.');
    if (!expiresAtRaw || !signature || rest.length > 0) return false;

    const expectedSignature = signPayload(expiresAtRaw);
    if (!safeEqual(signature, expectedSignature)) return false;

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt)) return false;
    return Date.now() < expiresAt;
};
