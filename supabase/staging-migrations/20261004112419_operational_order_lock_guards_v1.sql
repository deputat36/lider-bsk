-- STAGING ONLY. Order before job, matching create/design/order commands.
-- No data or permission changes. Bound to the inspected post-PR569 runtime.
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM leader_staging.environment_guard WHERE singleton=true
   AND project_ref='otulfnouybahfnsycxqn' AND environment_name='staging'
   AND repository='deputat36/lider-bsk') THEN RAISE EXCEPTION 'staging_environment_guard_failed'; END IF;
END $guard$;

DO $upgrade$
DECLARE f record; definition text; old_block text; new_block text; order_block text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('production','5030affad8df674ac162ffcd85ec7841','Linked order was not found'),
  ('installation','b6010ed4a185ad4976e82d71d44999fc','Linked order not found')
 ) AS baseline(kind,source_md5,missing_message)
 LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.leader_update_'||f.kind||'_job_rpc(jsonb)')
    AND md5(prosrc)=f.source_md5 AND NOT prosecdef)
  THEN RAISE EXCEPTION 'operational_lock_runtime_drift:%',f.kind; END IF;
  definition:=pg_get_functiondef(('public.leader_update_'||f.kind||'_job_rpc(jsonb)')::regprocedure);
  definition:=replace(definition,'  v_job_id uuid;',E'  v_job_id uuid;\n  v_linked_order_id uuid;');
  order_block:=format($block$  if v_job.order_id is not null then
    select * into v_order
    from public.leader_orders
    where id = v_job.order_id
    for update;
    if not found then
      return leader_private.leader_%s_command_error(v_request_id, 'not_found', '%s');
    end if;
  end if;
$block$,f.kind,f.missing_message);
  IF position(order_block IN definition)=0 THEN RAISE EXCEPTION 'order_lock_marker_missing:%',f.kind; END IF;
  definition:=replace(definition,order_block,'');
  old_block:=format($block$  select * into v_job
  from public.leader_%s_jobs
  where id = v_job_id
  for update;$block$,f.kind);
  new_block:=format($block$  -- Read only the parent id before acquiring row locks. Revalidate after locking the job.
  select order_id into v_linked_order_id
  from public.leader_%1$s_jobs where id = v_job_id;
  if not found then
    return leader_private.leader_%1$s_command_error(v_request_id, 'not_found', 'Job not found');
  end if;
  if v_linked_order_id is not null then
    select * into v_order from public.leader_orders
    where id = v_linked_order_id for update;
    if not found then
      return leader_private.leader_%1$s_command_error(v_request_id, 'not_found', 'Linked order not found');
    end if;
    if v_order.is_archived is true
       or lower(replace(btrim(coalesce(v_order.status,'')), 'ё', 'е'))
          in ('закрыт','закрыто','отменен','отменено','отмена','cancelled','closed') then
      return leader_private.leader_%1$s_command_error(v_request_id, 'invalid_transition', 'Closed or archived order cannot accept job changes');
    end if;
  end if;
  select * into v_job
  from public.leader_%1$s_jobs
  where id = v_job_id
  for update;
  if found and v_job.order_id is distinct from v_linked_order_id then
    return leader_private.leader_%1$s_command_error(v_request_id, 'conflict', 'Linked order changed while locking the job');
  end if;$block$,f.kind);
  IF position(old_block IN definition)=0 THEN RAISE EXCEPTION 'job_lock_marker_missing:%',f.kind; END IF;
  definition:=replace(definition,old_block,new_block);
  EXECUTE definition;
 END LOOP;
END $upgrade$;
