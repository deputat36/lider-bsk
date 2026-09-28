-- REVIEW CANDIDATE ONLY. Never run in production without explicit owner approval.
-- Requires SET LOCAL lider.repair_approval and lider.repair_actor in this transaction.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- After explicit approval, add SET LOCAL values here; see the runbook.
-- Default ending is ROLLBACK. A reviewed copy may replace it with COMMIT.
DO $repair$
DECLARE
  expected jsonb := $snapshot$[{"entity": "lead", "id": "e33082c6-bcef-409d-adff-545b6185da13", "status": "Создан заказ", "updated_at": "2026-06-16 09:44:56.778722+00"}, {"entity": "lead", "id": "ee79a85d-6645-450d-a705-ad9a45d37fbc", "status": "Создан заказ", "updated_at": "2026-06-21 13:37:08.889+00"}, {"entity": "lead", "id": "6a30b274-c394-4f4e-8397-dbe703ad6316", "status": "Создан заказ", "updated_at": "2026-06-17 05:44:56.778722+00"}, {"entity": "lead", "id": "5e482682-180b-41e7-ae43-fedb34cda162", "status": "Создан заказ", "updated_at": "2026-06-17 12:47:36.246+00"}, {"entity": "lead", "id": "8665cfe4-1a0f-49e5-bce7-c3c94a7eb791", "status": "Создан заказ", "updated_at": "2026-06-17 08:44:56.778722+00"}, {"entity": "calculation", "id": "d7d9ee72-25fc-4a3d-9819-0611af9de50b", "status": "Создан заказ", "updated_at": "2026-06-14 09:44:56.778722+00"}, {"entity": "calculation", "id": "777509d8-64ee-4406-a7a6-4f9cf2c3a5eb", "status": "Создан заказ", "updated_at": "2026-06-16 09:44:56.778722+00"}, {"entity": "calculation", "id": "8df2d8e8-3b18-4d49-ada3-ceeb0a71ce11", "status": "Создан заказ", "updated_at": "2026-06-21 13:37:19.565+00"}, {"entity": "calculation", "id": "39f62129-3ab8-420a-8b87-d9b1f288e4cc", "status": "Создан заказ", "updated_at": "2026-06-17 12:47:43.485+00"}, {"entity": "calculation", "id": "0597fdd3-eedb-4192-89ed-8b217e66f281", "status": "Создан заказ", "updated_at": "2026-06-16 09:44:56.778722+00"}, {"entity": "offer", "id": "fdf19de7-ca6f-49b2-9c06-20f328073675", "status": "Согласовано", "updated_at": "2026-06-16 09:44:56.778722+00"}, {"entity": "offer", "id": "76bd8557-5f34-4e1d-9320-06dbad25ba39", "status": "Согласовано", "updated_at": "2026-06-14 09:44:56.778722+00"}, {"entity": "offer", "id": "e5ba54f2-ef01-468e-878c-b1b748e9a2f3", "status": "Согласовано", "updated_at": "2026-06-16 09:44:56.778722+00"}, {"entity": "offer", "id": "c58adec4-3d23-4084-ab97-ac527aaa007c", "status": "Согласовано", "updated_at": "2026-06-21 13:37:19.565+00"}, {"entity": "offer", "id": "ae2b8b01-cf7a-455d-90a6-acba70d0c855", "status": "Согласовано", "updated_at": "2026-06-17 12:47:43.485+00"}]$snapshot$::jsonb;
  row_spec jsonb; before_row jsonb; after_row jsonb;
  saved_rows jsonb := '[]'::jsonb;
  table_name text; link_name text; target_status text;
  actor uuid := nullif(current_setting('lider.repair_actor', true), '')::uuid;
  backup_id uuid := gen_random_uuid();
  changed integer;
BEGIN
  IF coalesce(current_setting('lider.repair_approval', true), '') <> '381-test-status-reset-2026-09-27' THEN
    RAISE EXCEPTION 'owner_approval_required';
  END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.leader_user_profiles WHERE user_id=actor AND is_active AND role='owner') THEN
    RAISE EXCEPTION 'active_owner_actor_required';
  END IF;
  LOCK TABLE public.leader_leads, public.leader_lead_calculations, public.leader_commercial_offers, public.leader_orders IN SHARE ROW EXCLUSIVE MODE;
  IF jsonb_array_length(expected) <> 15 OR
     (SELECT count(*) FROM public.leader_leads WHERE status='Создан заказ' AND converted_order_id IS NULL) <> 5 OR
     (SELECT count(*) FROM public.leader_lead_calculations WHERE status='Создан заказ' AND order_id IS NULL) <> 5 OR
     (SELECT count(*) FROM public.leader_commercial_offers WHERE status='Согласовано' AND order_id IS NULL) <> 5 THEN
    RAISE EXCEPTION 'repair_scope_changed';
  END IF;
  FOR row_spec IN SELECT value FROM jsonb_array_elements(expected) LOOP
    CASE row_spec->>'entity'
      WHEN 'lead' THEN table_name:='leader_leads'; link_name:='converted_order_id'; target_status:='В работе';
      WHEN 'calculation' THEN table_name:='leader_lead_calculations'; link_name:='order_id'; target_status:='КП сформировано';
      WHEN 'offer' THEN table_name:='leader_commercial_offers'; link_name:='order_id'; target_status:='Черновик';
      ELSE RAISE EXCEPTION 'unexpected_entity';
    END CASE;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',table_name)
      INTO before_row USING (row_spec->>'id')::uuid;
    IF before_row IS NULL OR before_row->>'status' IS DISTINCT FROM row_spec->>'status' OR
       (before_row->>'updated_at')::timestamptz IS DISTINCT FROM (row_spec->>'updated_at')::timestamptz OR
       before_row->>link_name IS NOT NULL THEN
      RAISE EXCEPTION 'repair_row_changed: %', row_spec->>'id';
    END IF;
    IF table_name='leader_commercial_offers' AND NOT EXISTS (
      SELECT 1 FROM public.leader_lead_calculations
      WHERE id=(before_row->>'calculation_id')::uuid AND is_current_revision
    ) THEN RAISE EXCEPTION 'repair_offer_revision_changed'; END IF;
    EXECUTE format('UPDATE public.%I SET status=$1, updated_at=clock_timestamp() WHERE id=$2 RETURNING jsonb_build_object(''status'',status,''updated_at'',updated_at)',table_name)
      INTO after_row USING target_status,(row_spec->>'id')::uuid;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 OR after_row->>'status' IS DISTINCT FROM target_status THEN RAISE EXCEPTION 'repair_update_failed'; END IF;
    saved_rows := saved_rows || jsonb_build_array(jsonb_build_object('table',table_name,'link',link_name,'id',row_spec->>'id',
      'source_calculation_id',before_row->>'calculation_id',
      'before',jsonb_build_object('status',before_row->>'status','updated_at',before_row->'updated_at'),'after',after_row));
  END LOOP;
  INSERT INTO public.leader_backups(id,owner_id,label,data)
    VALUES(backup_id,actor,'issue381-status-repair-2026-09-27',jsonb_build_object('kind','issue381-status-repair-v1','rows',saved_rows));
  INSERT INTO public.leader_activity_log(user_id,action,entity,entity_id,data)
    VALUES(actor,'repair.issue381','status_links',backup_id::text,jsonb_build_object('affected_rows',15,'snapshot_id',backup_id));
  RAISE NOTICE 'Repair snapshot ID: %',backup_id;
END
$repair$;
SELECT id,label,created_at FROM public.leader_backups WHERE label='issue381-status-repair-2026-09-27' ORDER BY created_at DESC LIMIT 1;
-- Dry-run snapshot IDs disappear on rollback. Preserve only the committed ID.
ROLLBACK;
