import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsPanel from './ReportsPanel';

const fakeFetch = (urlMap: Record<string, unknown>) =>
    vi.fn(async (url: string) => {
        const key = Object.keys(urlMap).find((k) => url.startsWith(k));
        if (!key) return new Response('Not found', { status: 404 });
        return new Response(JSON.stringify(urlMap[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

describe('<ReportsPanel>', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('renders months and lists reports for the selected month', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [{
                id: 'r1', month: '2026-05', reportDate: '2026-05-19', sprintNumber: 77,
                title: 'Week 21', weekLabel: 'Week 21', dateRange: '18/05 - 22/05',
                originalFilename: 's.docx', fileSizeBytes: 0, uploadedBy: 'tri',
                createdAt: '', updatedAt: '',
            }] },
        }) as unknown as typeof fetch;

        render(<ReportsPanel canEdit={false} onSelect={() => {}} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText('Week 21')).toBeTruthy());
    });

    it('hides upload button when canEdit is false', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [] },
        }) as unknown as typeof fetch;
        render(<ReportsPanel canEdit={false} onSelect={() => {}} onClose={() => {}} />);
        await waitFor(() => expect(screen.queryByRole('button', { name: /upload/i })).toBeNull());
    });

    it('calls onSelect with id when row clicked', async () => {
        global.fetch = fakeFetch({
            '/api/reports/months': { months: ['2026-05'] },
            '/api/reports?month=2026-05': { reports: [{
                id: 'r1', month: '2026-05', reportDate: '2026-05-19', sprintNumber: 77,
                title: 'Week 21', weekLabel: 'Week 21', dateRange: '18/05 - 22/05',
                originalFilename: 's.docx', fileSizeBytes: 0, uploadedBy: 'tri',
                createdAt: '', updatedAt: '',
            }] },
        }) as unknown as typeof fetch;
        const onSelect = vi.fn();
        render(<ReportsPanel canEdit={false} onSelect={onSelect} onClose={() => {}} />);
        await waitFor(() => screen.getByText('Week 21'));
        fireEvent.click(screen.getByText('Week 21'));
        expect(onSelect).toHaveBeenCalledWith('r1');
    });
});
