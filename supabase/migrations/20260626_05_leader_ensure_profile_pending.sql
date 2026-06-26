create or replace function public.leader_ensure_profile(user_email text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session_email text := lower(trim(coalesce(auth.email(), '')));
  v_input_email text := lower(trim(coalesce(user_email, '')));
  v_email text;
  v_full_name text;
  v_role text;
  v_is_active boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if v_session_email = '' then
    raise exception 'authenticated email is required';
  end if;

  if v_input_email <> '' and v_input_email <> v_session_email then
    raise exception 'email does not match authenticated user';
  end if;

  select email, full_name, role, is_active
  into v_email, v_full_name, v_role, v_is_active
  from public.leader_user_profiles
  where user_id = v_uid
  limit 1;

  if not found then
    insert into public.leader_user_profiles(user_id, email, role, is_active, permissions)
    values (v_uid, v_session_email, 'manager', false, '{}'::jsonb)
    returning email, full_name, role, is_active
    into v_email, v_full_name, v_role, v_is_active;
  elsif v_email is distinct from v_session_email then
    update public.leader_user_profiles
    set email = v_session_email,
        updated_at = now()
    where user_id = v_uid
    returning email, full_name, role, is_active
    into v_email, v_full_name, v_role, v_is_active;
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'email', v_email,
    'full_name', v_full_name,
    'role', v_role,
    'is_active', v_is_active,
    'pending_access', not coalesce(v_is_active, false),
    'message', case when coalesce(v_is_active, false) then 'profile_ready' else 'profile_pending_owner_activation' end
  );
end;
$function$;

comment on function public.leader_ensure_profile(text)
is 'Ensures the current authenticated CRM user profile. Email is taken from auth.email(); new users are active only by invite, otherwise pending owner/admin activation.';
