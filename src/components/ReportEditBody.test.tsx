import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportEditBody from './ReportEditBody';

describe('<ReportEditBody>', () => {
    it('renders the initial HTML inside the editor', async () => {
        render(<ReportEditBody initialHtml="<p>hello <strong>world</strong></p>" onChange={() => {}} />);
        await waitFor(() => expect(screen.getByText('hello')).toBeTruthy(), { timeout: 2000 });
        expect(screen.getByText('world').tagName.toLowerCase()).toBe('strong');
    });

    it('calls onChange when content changes', async () => {
        const onChange = vi.fn();
        render(<ReportEditBody initialHtml="<p>x</p>" onChange={onChange} />);
        await waitFor(() => screen.getByText('x'), { timeout: 2000 });
        // Simulate typing by toggling source mode and changing content
        const sourceToggle = screen.getByRole('button', { name: /html source/i });
        fireEvent.click(sourceToggle);
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: '<p>y</p>' } });
        fireEvent.click(screen.getByRole('button', { name: /back to editor/i }));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('<p>y</p>')), { timeout: 2000 });
    });

    it('renders toolbar buttons', async () => {
        render(<ReportEditBody initialHtml="<p>x</p>" onChange={() => {}} />);
        expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
        expect(screen.getByRole('button', { name: /heading 1/i })).toBeTruthy();
    });
});
