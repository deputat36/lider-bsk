-- New Leader objects only; address every new public FK advisory.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create index if not exists leader_document_events_order_idx on public.leader_order_document_events(order_id);
create index if not exists leader_documents_client_idx on public.leader_order_documents(client_id);
create index if not exists leader_documents_previous_idx on public.leader_order_documents(previous_version_id);
create index if not exists leader_quote_events_actor_idx on public.leader_quote_events(actor_id);
create index if not exists leader_quote_requests_creator_idx on public.leader_quote_requests(created_by);
create index if not exists leader_quote_revisions_creator_idx on public.leader_quote_revisions(created_by);
create index if not exists leader_quote_templates_creator_idx on public.leader_quote_templates(created_by);
create index if not exists leader_quote_templates_source_quote_idx on public.leader_quote_templates(source_quote_id);
create index if not exists leader_quote_templates_source_task_idx on public.leader_quote_templates(source_task_id);
create index if not exists leader_finance_adjustments_out_idx on leader_private.leader_finance_adjustments(outgoing_payment_id);
create index if not exists leader_finance_adjustments_in_idx on leader_private.leader_finance_adjustments(incoming_payment_id);
create index if not exists leader_finance_adjustment_events_order_idx on leader_private.leader_finance_adjustment_events(order_id);
create index if not exists leader_finance_adjustment_events_adjustment_idx on leader_private.leader_finance_adjustment_events(adjustment_id);
commit;
