grant execute on function public.leader_ensure_profile(text) to service_role;
revoke all on function public.leader_ensure_profile(text) from anon;
revoke all on function public.leader_ensure_profile(text) from authenticated;
revoke all on function public.leader_ensure_profile(text) from public;

grant execute on function public.leader_apply_profile_invite() to service_role;
revoke all on function public.leader_apply_profile_invite() from anon;
revoke all on function public.leader_apply_profile_invite() from authenticated;
revoke all on function public.leader_apply_profile_invite() from public;
