create table if not exists public.leader_user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'manager',
  full_name text,
  is_active boolean not null default true,
  invited_by uuid,
  invited_by_email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leader_user_invites_email_check check (position('@' in email) > 1),
  constraint leader_user_invites_role_check check (role in ('owner','admin','manager','designer','production','installer'))
);

comment on table public.leader_user_invites
is 'РА Лидер: приглашения сотрудников в CRM. Без активного приглашения новый профиль создаётся неактивным и ждёт подтверждения владельцем/администратором.';

comment on column public.leader_user_invites.email is 'Email сотрудника в нижнем регистре.';
comment on column public.leader_user_invites.role is 'Роль, которую получит сотрудник после первого входа по приглашению.';
comment on column public.leader_user_invites.accepted_at is 'Когда приглашение было использовано при создании профиля.';
comment on column public.leader_user_invites.accepted_user_id is 'Auth user_id, который использовал приглашение.';

create unique index if not exists leader_user_invites_active_email_idx
on public.leader_user_invites (lower(email))
where is_active = true and accepted_at is null;

create index if not exists leader_user_invites_created_at_idx
on public.leader_user_invites (created_at desc);

alter table public.leader_user_invites enable row level security;

revoke all on public.leader_user_invites from anon;
revoke all on public.leader_user_invites from public;
grant select, insert, update on public.leader_user_invites to authenticated;

alter table public.leader_user_invites
  drop constraint if exists leader_user_invites_invited_by_fkey;

alter table public.leader_user_invites
  add constraint leader_user_invites_invited_by_fkey
  foreign key (invited_by) references public.leader_user_profiles(user_id)
  on delete set null;

alter table public.leader_user_invites
  drop constraint if exists leader_user_invites_accepted_user_id_fkey;

alter table public.leader_user_invites
  add constraint leader_user_invites_accepted_user_id_fkey
  foreign key (accepted_user_id) references public.leader_user_profiles(user_id)
  on delete set null;

drop policy if exists leader_user_invites_admin_select on public.leader_user_invites;
drop policy if exists leader_user_invites_admin_insert on public.leader_user_invites;
drop policy if exists leader_user_invites_admin_update on public.leader_user_invites;

create policy leader_user_invites_admin_select
on public.leader_user_invites
for select
to authenticated
using ((select leader_private.leader_is_admin()));

create policy leader_user_invites_admin_insert
on public.leader_user_invites
for insert
to authenticated
with check ((select leader_private.leader_is_admin()));

create policy leader_user_invites_admin_update
on public.leader_user_invites
for update
to authenticated
using ((select leader_private.leader_is_admin()))
with check ((select leader_private.leader_is_admin()));

create or replace function public.leader_normalize_invite_email()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.role := lower(trim(coalesce(new.role, 'manager')));
  new.updated_at := now();
  return new;
end;
$function$;

comment on function public.leader_normalize_invite_email()
is 'РА Лидер: нормализует email и роль приглашения CRM перед записью.';

drop trigger if exists leader_user_invites_normalize_trg on public.leader_user_invites;

create trigger leader_user_invites_normalize_trg
before insert or update on public.leader_user_invites
for each row
execute function public.leader_normalize_invite_email();

create or replace function public.leader_apply_profile_invite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite record;
  v_has_active_owner boolean;
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.role := lower(trim(coalesce(new.role, 'manager')));
  new.permissions := coalesce(new.permissions, '{}'::jsonb);

  if tg_op = 'INSERT' then
    select id, role, full_name
    into v_invite
    from public.leader_user_invites
    where lower(email) = new.email
      and is_active = true
      and accepted_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if found then
      new.role := coalesce(nullif(lower(trim(v_invite.role)), ''), 'manager');
      new.is_active := true;
      new.full_name := coalesce(nullif(new.full_name, ''), nullif(v_invite.full_name, ''));

      update public.leader_user_invites
      set accepted_at = now(),
          accepted_user_id = new.user_id,
          is_active = false,
          updated_at = now()
      where id = v_invite.id;
    else
      select exists (
        select 1
        from public.leader_user_profiles
        where role = 'owner'
          and is_active = true
        limit 1
      ) into v_has_active_owner;

      new.role := case when v_has_active_owner then 'manager' else 'owner' end;
      new.is_active := false;
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.leader_apply_profile_invite()
is 'РА Лидер: при создании CRM-профиля активирует пользователя только по действующему приглашению; без приглашения профиль остаётся неактивным.';

drop trigger if exists leader_apply_profile_invite_trg on public.leader_user_profiles;

create trigger leader_apply_profile_invite_trg
before insert on public.leader_user_profiles
for each row
execute function public.leader_apply_profile_invite();

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
