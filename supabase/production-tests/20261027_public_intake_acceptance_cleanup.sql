begin;
do $$ begin
 if exists(select 1 from public.leader_leads where request_id='recovery-public-intake-20261027-e2e' and (name is distinct from 'ТЕХНИЧЕСКАЯ ПРОВЕРКА 27.10 — удалить' or source_page_path is distinct from '/recovery-acceptance-test')) then raise exception 'synthetic_cleanup_identity_mismatch';end if;
 if exists(select 1 from public.leader_orders o join public.leader_leads l on l.id=o.lead_id where l.request_id='recovery-public-intake-20261027-e2e') then raise exception 'synthetic_cleanup_has_order';end if;
 delete from public.leader_public_lead_audit where request_id in ('recovery-public-intake-ready-20261027','recovery-public-intake-20261027-e2e');
 delete from public.leader_leads where request_id='recovery-public-intake-20261027-e2e' and name='ТЕХНИЧЕСКАЯ ПРОВЕРКА 27.10 — удалить' and source_page_path='/recovery-acceptance-test';
 delete from leader_private.leader_public_intake_rate_limit_receipts where request_id in ('recovery-public-intake-ready-20261027','recovery-public-intake-20261027-e2e');
end $$;
commit;
