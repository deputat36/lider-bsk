grant execute on function public.leader_ensure_profile(text) to authenticated;
grant execute on function public.leader_ensure_profile(text) to service_role;
revoke all on function public.leader_ensure_profile(text) from anon;
revoke all on function public.leader_ensure_profile(text) from public;
