This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in Supabase + Editor auth + Cloudinary variables.

```bash
cp .env.example .env.local
```

## Production Upload Checklist

1. Rotate and set fresh production credentials:
- `CLOUDINARY_URL` (or split `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`)
- `EDITOR_PASSWORD`
- `EDITOR_SESSION_SECRET`
2. Configure upload behavior:
- `UPLOAD_MAX_MB`
- `CLOUDINARY_UPLOAD_FOLDER`
- `CLOUDINARY_ALLOWED_IMAGE_FORMATS`
3. Configure API rate limits:
- `IMAGE_UPLOAD_RATE_LIMIT_MAX`
- `IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS`
- `IMAGE_DELETE_RATE_LIMIT_MAX`
- `IMAGE_DELETE_RATE_LIMIT_WINDOW_MS`
4. Verify editor-only access:
- `/api/image/upload` and `/api/image/delete` return `401` without editor session.
5. Verify smoke tests in production/staging:
- Upload valid image (`jpg/png/webp`) -> success
- Upload invalid type or too-large file -> `400`
- Burst requests above limit -> `429`
- Delete image in managed folder -> success
6. Configure weekly-report upload behavior:
- `REPORT_UPLOAD_MAX_MB` (default `10`)
- `REPORT_STORAGE_BUCKET` (default `reports`; bucket must exist in Supabase Storage and be **private**)
7. Configure weekly-report API rate limits:
- `REPORT_UPLOAD_RATE_LIMIT_MAX` (default `10`) / `REPORT_UPLOAD_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `REPORT_DELETE_RATE_LIMIT_MAX` (default `20`) / `REPORT_DELETE_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `REPORT_DOWNLOAD_RATE_LIMIT_MAX` (default `60`) / `REPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS` (default `60000`)
8. Verify editor-only access for reports:
- `POST /api/reports` and `DELETE /api/reports/[id]` return `401` without editor session.
- `PATCH /api/reports/[id]` (editor-only, rate-limited by `REPORT_UPLOAD_RATE_LIMIT_*`) — edit metadata + HTML content
- `PUT /api/reports/[id]/file` (editor-only, rate-limited by `REPORT_UPLOAD_RATE_LIMIT_*`) — replace original `.docx`
9. Verify weekly-report smoke tests in production/staging:
- Upload valid `.docx` -> success; row appears in side panel under correct month.
- Upload `.pdf` or file >10 MB -> `400`.
- Burst uploads above limit -> `429`.
- Delete a report -> DB row removed and Supabase Storage object removed.
- Open report popup -> drag/resize works; reload preserves window position/size.
- Editor: open popup → Edit → change title → Save → list refreshes with new title
- Editor: in edit mode → Replace .docx → content updates, popup stays in edit mode
- Non-editor: `PATCH` and `PUT` both return 401

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
