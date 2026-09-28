-- Read-only, leader_* only. Missing nullable links require business classification.
BEGIN TRANSACTION READ ONLY;
select 'converted_lead_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb) as ids from leader_leads l where l.status='Создан заказ' and not exists(select 1 from leader_orders o where o.id=l.converted_order_id)
union all
select 'lead_client_orphan' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb) as ids from leader_leads l where l.converted_client_id is not null and not exists(select 1 from leader_clients c where c.id=l.converted_client_id)
union all
select 'lead_order_mismatch' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb) as ids from leader_leads l join leader_orders o on o.id=l.converted_order_id where o.lead_id is distinct from l.id
union all
select 'calculation_without_need' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) as ids from leader_lead_calculations c where not exists(select 1 from leader_lead_needs n where n.id=c.need_id)
union all
select 'calculation_need_mismatch' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) as ids from leader_lead_calculations c join leader_lead_needs n on n.id=c.need_id where n.lead_id is distinct from c.lead_id
union all
select 'converted_calculation_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) as ids from leader_lead_calculations c where c.status='Создан заказ' and not exists(select 1 from leader_orders o where o.id=c.order_id)
union all
select 'offer_without_calculation' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(f.id order by f.id),'[]'::jsonb) as ids from leader_commercial_offers f where not exists(select 1 from leader_lead_calculations c where c.id=f.calculation_id)
union all
select 'agreed_offer_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(f.id order by f.id),'[]'::jsonb) as ids from leader_commercial_offers f where f.status='Согласовано' and not exists(select 1 from leader_orders o where o.id=f.order_id)
union all
select 'order_without_client' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(o.id order by o.id),'[]'::jsonb) as ids from leader_orders o where not exists(select 1 from leader_clients c where c.id=o.client_id)
union all
select 'order_without_items' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(o.id order by o.id),'[]'::jsonb) as ids from leader_orders o where not exists(select 1 from leader_order_items i where i.order_id=o.id)
union all
select 'production_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb) as ids from leader_production_jobs p where not exists(select 1 from leader_orders o where o.id=p.order_id)
union all
select 'installation_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(i.id order by i.id),'[]'::jsonb) as ids from leader_installation_jobs i where not exists(select 1 from leader_orders o where o.id=i.order_id)
union all
select 'design_without_source' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(d.id order by d.id),'[]'::jsonb) as ids from leader_design_tasks d where not exists(select 1 from leader_orders o where o.id=d.order_id) and not exists(select 1 from leader_production_jobs p where p.id=d.production_job_id)
union all
select 'payment_without_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb) as ids from leader_payments p where not exists(select 1 from leader_orders o where o.id=p.order_id)
union all
select 'expense_broken_order' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(e.id order by e.id),'[]'::jsonb) as ids from leader_expenses e where e.order_id is not null and not exists(select 1 from leader_orders o where o.id=e.order_id)
union all
select 'calculation_totals_mismatch' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) as ids from leader_lead_calculations c where abs(c.client_total-c.contractor_cost-c.profit)>0.01 or c.client_total<0 or c.contractor_cost<0
union all
select 'calculation_items_totals_mismatch' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) as ids from leader_lead_calculations c where abs(c.client_total-coalesce((select sum(i.client_sum) from leader_lead_calculation_items i where i.calculation_id=c.id),0))>0.01
union all
select 'order_totals_mismatch' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(o.id order by o.id),'[]'::jsonb) as ids from leader_orders o where abs(o.client_total-o.contractor_cost-o.profit)>0.01 or o.client_total<0 or o.contractor_cost<0
union all
select 'duplicate_request_id' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb) as ids from leader_leads l where l.request_id is not null and l.request_id in (select request_id from leader_leads where request_id is not null group by request_id having count(*)>1)
union all
select 'suspected_lead_duplicates' as check_name,count(*)::integer as affected_count,coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb) as ids from leader_leads l where l.phone_normalized is not null and exists(select 1 from leader_leads x where x.id<>l.id and x.phone_normalized=l.phone_normalized and x.service is not distinct from l.service and abs(extract(epoch from x.created_at-l.created_at))<300);
ROLLBACK;
