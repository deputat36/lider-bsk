revoke execute on function public.leader_get_leads_for_crm() from public;
revoke execute on function public.leader_get_leads_for_crm() from anon;
revoke execute on function public.leader_get_leads_for_crm() from authenticated;

comment on function public.leader_get_leads_for_crm()
is 'Legacy CRM leads RPC. Direct client execution is disabled; CRM should read leader_leads through RLS or approved Edge Functions.';
