'use client';

interface LoginFormProps {
    onGoogleLogin: () => Promise<void>;
    onGuestView: () => void;
    error?: string | null;
}

export function LoginForm({ onGoogleLogin, onGuestView, error }: LoginFormProps) {
    return (
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Dang nhap Roadmap</h2>
            <p className="mb-6 text-sm text-slate-500">
                Dang nhap bang Google de dung dung quyen team, hoac vao che do viewer.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
                    {error}
                </div>
            )}

            <button
                onClick={() => void onGoogleLogin()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09A6.96 6.96 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.95 10.95 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Dang nhap bang Google
            </button>

            <div className="my-4 flex items-center gap-3">
                <hr className="flex-1 border-slate-200" />
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Hoac</span>
                <hr className="flex-1 border-slate-200" />
            </div>

            <button
                onClick={onGuestView}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50"
            >
                Xem khong can dang nhap
            </button>
        </div>
    );
}
