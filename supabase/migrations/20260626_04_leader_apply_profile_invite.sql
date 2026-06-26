create or replace function public.leader_apply_profile_invite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  invite_row record;
  has_owner boolean;
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.role := lower(trim(coalesce(new.role, 'manager')));
  new.permissions := coalesce(new.permissions, '{}'::jsonb);

  select id, role, full_name
  into invite_row
  from public.leader_user_invites
  where lower(email) = new.email
    and is_active = true
    and accepted_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if found then
    new.role := coalesce(nullif(lower(trim(invite_row.role)), ''), 'manager');
    new.is_active := true;
    new.full_name := coalesce(nullif(new.full_name, ''), nullif(invite_row.full_name, ''));

    update public.leader_user_invites
    set accepted_at = now(),
        accepted_user_id = new.user_id,
        is_active = false,
        updated_at = now()
    where id = invite_row.id;
  else
    select exists (
      select 1 from public.leader_user_profiles
      where role = 'owner' and is_active = true
      limit 1
    ) into has_owner;

    new.role := case when has_owner then 'manager' else 'owner' end;
    new.is_active := false;
  end if;

  return new;
end;
$fn$;

drop trigger if exists leader_apply_profile_invite_trg on public.leader_user_profiles;

create trigger leader_apply_profile_invite_trg
before insert on public.leader_user_profiles
for each row
execute function public.leader_apply_profile_invite();
