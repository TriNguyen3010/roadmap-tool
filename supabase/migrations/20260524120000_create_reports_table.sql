-- Weekly report library: stores parsed HTML of uploaded .docx files
-- See docs/superpowers/specs/2026-05-24-weekly-report-popup-design.md

create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),

    -- Filtering / sorting
    month text not null,                       -- 'YYYY-MM'
    report_date date not null,
    sprint_number int,

    -- Display
    title text not null,
    week_label text,
    date_range text,

    -- Content
    original_filename text not null,
    original_storage_path text not null,
    html_content text not null,
    raw_text text,

    -- Audit
    uploaded_by text,
    file_size_bytes int not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists reports_month_idx
    on public.reports (month, report_date desc, sprint_number desc);

-- Touch updated_at automatically
create or replace function public.reports_touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
    before update on public.reports
    for each row execute function public.reports_touch_updated_at();
