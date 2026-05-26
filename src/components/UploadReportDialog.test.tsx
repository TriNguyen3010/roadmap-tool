import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UploadReportDialog from './UploadReportDialog';

vi.mock('mammoth', () => ({
    default: {
        extractRawText: vi.fn(async () => ({
            value: 'Ngày: 19/05/2026\nWeek 21 Report\n18/05 - 22/05\nSPRINT 77',
            messages: [],
        })),
    },
}));

// jsdom doesn't implement Blob.arrayBuffer in this env; polyfill so the dialog's parse path runs.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = async function () {
        return new ArrayBuffer(0);
    };
}

const makeDocx = (name = 'sample.docx') =>
    new File(['fake-bytes'], name, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

describe('<UploadReportDialog>', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('pre-fills fields from the parsed .docx and submits metadata with the file', async () => {
        const fetchSpy = vi.fn(async () => new Response(
            JSON.stringify({ report: { id: 'r1' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
        global.fetch = fetchSpy as unknown as typeof fetch;

        const onUploaded = vi.fn();
        render(<UploadReportDialog onClose={() => {}} onUploaded={onUploaded} onError={() => {}} />);

        const input = screen.getByLabelText(/\.docx file/i) as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeDocx()] } });

        const titleInput = await waitFor(() => screen.getByLabelText(/^Title$/i) as HTMLInputElement);
        expect(titleInput.value).toBe('Week 21 · 18/05 - 22/05');
        expect((screen.getByLabelText(/Week label/i) as HTMLInputElement).value).toBe('Week 21');
        expect((screen.getByLabelText(/Sprint #/i) as HTMLInputElement).value).toBe('77');
        expect((screen.getByLabelText(/Date range/i) as HTMLInputElement).value).toBe('18/05 - 22/05');
        expect((screen.getByLabelText(/Report date/i) as HTMLInputElement).value).toBe('2026-05-19');

        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/reports');
        const body = init.body as FormData;
        expect(body.get('file')).toBeInstanceOf(File);
        const metadata = JSON.parse(body.get('metadata') as string);
        expect(metadata).toEqual({
            month: '2026-05',
            reportDate: '2026-05-19',
            sprintNumber: 77,
            weekLabel: 'Week 21',
            dateRange: '18/05 - 22/05',
            title: 'Week 21 · 18/05 - 22/05',
        });

        await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ id: 'r1' }));
    });

    it('falls back to manual entry when mammoth parse fails', async () => {
        const mammoth = (await import('mammoth')).default as { extractRawText: ReturnType<typeof vi.fn> };
        mammoth.extractRawText.mockRejectedValueOnce(new Error('bad zip'));

        render(<UploadReportDialog onClose={() => {}} onUploaded={() => {}} onError={() => {}} />);
        const input = screen.getByLabelText(/\.docx file/i) as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeDocx()] } });

        await waitFor(() => expect(screen.getByText(/Couldn't auto-parse/i)).toBeTruthy());
        // Save stays disabled while required fields are empty.
        expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true);
    });
});
