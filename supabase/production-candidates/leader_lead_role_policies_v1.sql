-- Close the observed gap: an active profile alone must not grant all lead access.
-- Existing policies/grants remain; restrictive checks require canonical actions.
begin;
do $$ begin
 if to_regprocedure('leader_private.leader_has_crm_action(text)') is null then raise exception 'canonical_action_helper_required';end if;
end $$;
create policy leader_leads_canonical_read on public.leader_leads as restrictive for select to authenticated
 using((select leader_private.leader_has_crm_action('leads.read')));
create policy leader_leads_canonical_create on public.leader_leads as restrictive for insert to authenticated
 with check((select leader_private.leader_has_crm_action('leads.create')));
create policy leader_leads_canonical_update on public.leader_leads as restrictive for update to authenticated
 using((select leader_private.leader_has_crm_action('leads.update')))
 with check((select leader_private.leader_has_crm_action('leads.update')));
commit;
