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

create unique index if not exists leader_user_invites_active_email_idx
on public.leader_user_invites (lower(email))
where is_active = true and accepted_at is null;

create index if not exists leader_user_invites_created_at_idx
on public.leader_user_invites (created_at desc);

alter table public.leader_user_invites enable row level security;

revoke all on public.leader_user_invites from anon;
revoke all on public.leader_user_invites from public;
grant select, insert, update on public.leader_user_invites to authenticated;
