import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportPopup from './ReportPopup';
import type { Report } from '@/types/report';

const REPORT: Report = {
    id: 'r1',
    month: '2026-05',
    reportDate: '2026-05-19',
    sprintNumber: 77,
    title: 'Week 21 · 18/05 - 22/05',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    originalFilename: 'sample.docx',
    fileSizeBytes: 1234,
    uploadedBy: 'tri',
    createdAt: '2026-05-22T10:00:00Z',
    updatedAt: '2026-05-22T10:00:00Z',
    htmlContent: '<h1>Hello</h1><p>Body <strong>bold</strong></p>',
};

describe('<ReportPopup>', () => {
    it('renders the sanitized HTML', () => {
        render(<ReportPopup report={REPORT} onClose={() => {}} onDownload={() => {}} />);
        expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy();
        expect(screen.getByText('bold')).toBeTruthy();
    });

    it('fires onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(<ReportPopup report={REPORT} onClose={onClose} onDownload={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('fires onDownload when download button clicked', () => {
        const onDownload = vi.fn();
        render(<ReportPopup report={REPORT} onClose={() => {}} onDownload={onDownload} />);
        fireEvent.click(screen.getByRole('button', { name: /download/i }));
        expect(onDownload).toHaveBeenCalled();
    });

    it('fires onClose on Escape key', () => {
        const onClose = vi.fn();
        render(<ReportPopup report={REPORT} onClose={onClose} onDownload={() => {}} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
