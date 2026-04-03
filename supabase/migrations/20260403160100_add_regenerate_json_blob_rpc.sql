-- RPC function for reverse dual-write (rows → JSON blob backup).
-- Sets app.skip_forward_dual_write to prevent the forward trigger from firing.

create or replace function public.regenerate_roadmap_json_blob(
    p_roadmap_id text,
    p_content jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Skip forward dual-write trigger for this transaction
    perform set_config('app.skip_forward_dual_write', 'true', true);

    update public.roadmap_data
    set content = p_content,
        updated_at = now()
    where id = p_roadmap_id;

    -- If no row exists, insert it
    if not found then
        insert into public.roadmap_data (id, content, updated_at)
        values (p_roadmap_id, p_content, now());
    end if;
end;
$$;
