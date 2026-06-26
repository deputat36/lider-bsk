create index if not exists leader_user_invites_invited_by_idx
on public.leader_user_invites(invited_by);

create index if not exists leader_user_invites_accepted_user_id_idx
on public.leader_user_invites(accepted_user_id);
