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
    if not exists (
      select 1
      from public.leader_user_profiles
      where role = 'owner'
        and is_active = true
      limit 1
    ) then
      v_role := 'owner';
    else
      v_role := 'manager';
    end if;

    insert into public.leader_user_profiles(user_id, email, role, is_active)
    values (v_uid, v_session_email, v_role, true)
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
    'is_active', v_is_active
  );
end;
$function$;

comment on function public.leader_ensure_profile(text)
is 'Ensures the current authenticated CRM user profile. Email is taken from auth.email(); client-provided email must match the authenticated session.';
