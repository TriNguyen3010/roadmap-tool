import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportEditMetaForm from './ReportEditMetaForm';
import type { MetaDraft } from '@/types/report';

const VALUE: MetaDraft = {
    title: 'Week 21',
    weekLabel: 'Week 21',
    dateRange: '18/05 - 22/05',
    sprintNumber: 77,
    reportDate: '2026-05-19',
};

describe('<ReportEditMetaForm>', () => {
    it('renders all fields with current values', () => {
        render(<ReportEditMetaForm value={VALUE} onChange={() => {}} errors={{}} />);
        expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('Week 21');
        expect((screen.getByLabelText(/sprint/i) as HTMLInputElement).value).toBe('77');
        expect((screen.getByLabelText(/report date/i) as HTMLInputElement).value).toBe('2026-05-19');
    });

    it('calls onChange with new value when title changes', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Week 22' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, title: 'Week 22' });
    });

    it('coerces sprint number from string to number', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/sprint/i), { target: { value: '78' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, sprintNumber: 78 });
    });

    it('passes null sprint number for empty input', () => {
        const onChange = vi.fn();
        render(<ReportEditMetaForm value={VALUE} onChange={onChange} errors={{}} />);
        fireEvent.change(screen.getByLabelText(/sprint/i), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith({ ...VALUE, sprintNumber: null });
    });

    it('shows error message when errors prop set', () => {
        render(<ReportEditMetaForm value={VALUE} onChange={() => {}} errors={{ reportDate: 'Bad date' }} />);
        expect(screen.getByText('Bad date')).toBeTruthy();
    });
});
