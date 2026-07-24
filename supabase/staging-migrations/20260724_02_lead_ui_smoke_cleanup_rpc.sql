-- STAGING ONLY.
-- Removes synthetic lead workflow UI-smoke rows, including receipts in the private schema.
-- Callable only by service_role.

create or replace function public.leader_staging_lead_ui_smoke_cleanup_rpc(p_run_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker text;
  v_actor_ids uuid[] := array[]::uuid[];
  v_leads integer := 0;
  v_profiles integer := 0;
  v_receipts integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_run_key is null or p_run_key !~ '^[0-9]+:[0-9]+$' then
    raise exception 'run_key_invalid' using errcode = '22023';
  end if;

  v_marker := 'leader-lead-ui-smoke:' || p_run_key;

  select coalesce(array_agg(p.user_id), array[]::uuid[])
    into v_actor_ids
  from public.leader_user_profiles p
  where p.full_name = v_marker;

  if cardinality(v_actor_ids) > 0 then
    delete from leader_private.leader_command_receipts r
    where r.actor_id = any(v_actor_ids);
  end if;

  delete from public.leader_leads l
  where l.request_id = v_marker;

  delete from public.leader_user_profiles p
  where p.full_name = v_marker;

  select count(*)::integer into v_leads
  from public.leader_leads l
  where l.request_id = v_marker;

  select count(*)::integer into v_profiles
  from public.leader_user_profiles p
  where p.full_name = v_marker;

  if cardinality(v_actor_ids) > 0 then
    select count(*)::integer into v_receipts
    from leader_private.leader_command_receipts r
    where r.actor_id = any(v_actor_ids);
  end if;

  return jsonb_build_object(
    'ok', true,
    'actor_ids', to_jsonb(v_actor_ids),
    'residue', jsonb_build_object(
      'leads', v_leads,
      'profiles', v_profiles,
      'receipts', v_receipts
    )
  );
end;
$$;

revoke all on function public.leader_staging_lead_ui_smoke_cleanup_rpc(text) from public;
revoke all on function public.leader_staging_lead_ui_smoke_cleanup_rpc(text) from anon;
revoke all on function public.leader_staging_lead_ui_smoke_cleanup_rpc(text) from authenticated;
grant execute on function public.leader_staging_lead_ui_smoke_cleanup_rpc(text) to service_role;
