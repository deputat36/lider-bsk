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
