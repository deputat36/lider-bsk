-- REVIEW CANDIDATE ONLY. Never run in production without explicit owner approval.
-- Requires SET LOCAL lider.repair_approval and lider.repair_actor in this transaction.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Also requires lider.repair_snapshot = exact UUID returned by apply.
-- Default ending is ROLLBACK; a separately approved reviewed copy may COMMIT.
DO $rollback$
DECLARE
  actor uuid := nullif(current_setting('lider.repair_actor',true),'')::uuid;
  snapshot_id uuid := nullif(current_setting('lider.repair_snapshot',true),'')::uuid;
  saved jsonb; row_spec jsonb; current_row jsonb; changed integer;
BEGIN
  IF coalesce(current_setting('lider.repair_approval',true),'') <> '381-restore-statuses-2026-09-27' THEN RAISE EXCEPTION 'owner_approval_required'; END IF;
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.leader_user_profiles WHERE user_id=actor AND is_active AND role='owner') THEN RAISE EXCEPTION 'active_owner_actor_required'; END IF;
  LOCK TABLE public.leader_leads, public.leader_lead_calculations, public.leader_commercial_offers, public.leader_orders IN SHARE ROW EXCLUSIVE MODE;
  SELECT data INTO saved FROM public.leader_backups
    WHERE id=snapshot_id AND label='issue381-status-repair-2026-09-27' AND data->>'kind'='issue381-status-repair-v1' FOR UPDATE;
  IF saved IS NULL OR saved ? 'rolled_back_at' OR jsonb_typeof(saved->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'repair_snapshot_invalid'; END IF;
  IF jsonb_array_length(saved->'rows')<>15 THEN RAISE EXCEPTION 'repair_snapshot_invalid'; END IF;
  FOR row_spec IN SELECT value FROM jsonb_array_elements(saved->'rows') LOOP
    IF NOT ((row_spec->>'table'='leader_leads' AND row_spec->>'link'='converted_order_id') OR
      (row_spec->>'table' IN ('leader_lead_calculations','leader_commercial_offers') AND row_spec->>'link'='order_id')) THEN RAISE EXCEPTION 'repair_snapshot_scope_invalid'; END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',row_spec->>'table') INTO current_row USING (row_spec->>'id')::uuid;
    IF current_row IS NULL OR current_row->>'status' IS DISTINCT FROM row_spec->'after'->>'status' OR
      (current_row->>'updated_at')::timestamptz IS DISTINCT FROM (row_spec->'after'->>'updated_at')::timestamptz OR
      current_row->>(row_spec->>'link') IS NOT NULL THEN RAISE EXCEPTION 'rollback_row_changed: %',row_spec->>'id'; END IF;
    IF row_spec->>'table'='leader_commercial_offers' AND (
      current_row->>'calculation_id' IS DISTINCT FROM row_spec->>'source_calculation_id' OR
      NOT EXISTS (SELECT 1 FROM public.leader_lead_calculations
        WHERE id=(current_row->>'calculation_id')::uuid AND is_current_revision)
    ) THEN RAISE EXCEPTION 'rollback_offer_revision_changed'; END IF;
    EXECUTE format('UPDATE public.%I SET status=$1, updated_at=clock_timestamp() WHERE id=$2',row_spec->>'table')
      USING row_spec->'before'->>'status',(row_spec->>'id')::uuid;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'rollback_update_failed'; END IF;
  END LOOP;
  UPDATE public.leader_backups SET data=data||jsonb_build_object('rolled_back_at',clock_timestamp(),'rolled_back_by',actor) WHERE id=snapshot_id;
  INSERT INTO public.leader_activity_log(user_id,action,entity,entity_id,data)
    VALUES(actor,'rollback.issue381','status_links',snapshot_id::text,jsonb_build_object('affected_rows',15,'snapshot_id',snapshot_id));
END
$rollback$;
ROLLBACK;
