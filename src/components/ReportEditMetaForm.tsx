'use client';

import type { MetaDraft } from '@/types/report';

export type MetaErrors = Partial<Record<keyof MetaDraft, string>>;

interface Props {
    value: MetaDraft;
    onChange: (next: MetaDraft) => void;
    errors: MetaErrors;
}

const fieldClass = (hasError: boolean) =>
    `w-full rounded border px-2 py-1 text-sm ${hasError ? 'border-red-500' : 'border-gray-300'}`;

const errorText = (msg?: string) =>
    msg ? <div className="mt-0.5 text-xs text-red-600">{msg}</div> : null;

export default function ReportEditMetaForm({ value, onChange, errors }: Props) {
    const update = <K extends keyof MetaDraft>(key: K, v: MetaDraft[K]) =>
        onChange({ ...value, [key]: v });

    return (
        <div className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50/50">
            <label className="col-span-2 text-xs text-gray-600">
                Title
                <input
                    type="text"
                    value={value.title}
                    onChange={(e) => update('title', e.target.value)}
                    className={fieldClass(!!errors.title)}
                />
                {errorText(errors.title)}
            </label>
            <label className="text-xs text-gray-600">
                Week label
                <input
                    type="text"
                    value={value.weekLabel}
                    onChange={(e) => update('weekLabel', e.target.value)}
                    className={fieldClass(!!errors.weekLabel)}
                />
                {errorText(errors.weekLabel)}
            </label>
            <label className="text-xs text-gray-600">
                Sprint number
                <input
                    type="number"
                    min={0}
                    value={value.sprintNumber ?? ''}
                    onChange={(e) =>
                        update('sprintNumber', e.target.value === '' ? null : Number(e.target.value))
                    }
                    className={fieldClass(!!errors.sprintNumber)}
                />
                {errorText(errors.sprintNumber)}
            </label>
            <label className="text-xs text-gray-600">
                Date range
                <input
                    type="text"
                    value={value.dateRange}
                    onChange={(e) => update('dateRange', e.target.value)}
                    placeholder="18/05 - 22/05"
                    className={fieldClass(!!errors.dateRange)}
                />
                {errorText(errors.dateRange)}
            </label>
            <label className="text-xs text-gray-600">
                Report date
                <input
                    type="date"
                    value={value.reportDate}
                    onChange={(e) => update('reportDate', e.target.value)}
                    className={fieldClass(!!errors.reportDate)}
                />
                {errorText(errors.reportDate)}
            </label>
        </div>
    );
}
