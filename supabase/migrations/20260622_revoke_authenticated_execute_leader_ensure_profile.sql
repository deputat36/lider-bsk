revoke execute on function public.leader_ensure_profile(text) from public;
revoke execute on function public.leader_ensure_profile(text) from anon;
revoke execute on function public.leader_ensure_profile(text) from authenticated;
grant execute on function public.leader_ensure_profile(text) to service_role;

comment on function public.leader_ensure_profile(text) is
  'Legacy profile bootstrap RPC. Direct client EXECUTE is revoked; CRM v4 uses leader-crm-leads action ensure_profile.';
