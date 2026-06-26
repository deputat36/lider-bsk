grant execute on function public.leader_ensure_profile(text) to authenticated;
revoke all on function public.leader_ensure_profile(text) from anon;
revoke all on function public.leader_ensure_profile(text) from public;

revoke all on function public.leader_apply_profile_invite() from anon;
revoke all on function public.leader_apply_profile_invite() from authenticated;
revoke all on function public.leader_apply_profile_invite() from public;