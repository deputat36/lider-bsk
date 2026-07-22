-- STAGING ONLY.
-- Reproducible source for 20260722055815 /
-- staging_installation_read_order_status_fix_20260722.
-- Adds leader_orders.installation_status to the safe order projection.
-- Never apply this migration to production.

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

create or replace function public.leader_read_installation_job_rpc(
  p_actor_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_job public.leader_installation_jobs%rowtype;
  v_result jsonb;
begin
  if p_actor_id is null or p_job_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'validation_error', 'message', 'actor_id and job_id are required')
    );
  end if;

  if not leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.read') then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'forbidden', 'message', 'installation.read permission is required')
    );
  end if;

  select * into v_job
  from public.leader_installation_jobs
  where id = p_job_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'not_found', 'message', 'Installation job not found')
    );
  end if;

  select jsonb_build_object(
    'ok', true,
    'action', 'installation_job.read',
    'entity', jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'production_job_id', v_job.production_job_id,
      'title', v_job.title,
      'install_status', v_job.install_status,
      'priority', v_job.priority,
      'installer_name', v_job.installer_name,
      'installer_phone', v_job.installer_phone,
      'address', v_job.address,
      'scheduled_at', v_job.scheduled_at,
      'started_at', v_job.started_at,
      'completed_at', v_job.completed_at,
      'accepted_at', v_job.accepted_at,
      'technical_task', v_job.technical_task,
      'tools_required', v_job.tools_required,
      'installer_comment', v_job.installer_comment,
      'result_comment', v_job.result_comment,
      'before_photo_url', v_job.before_photo_url,
      'after_photo_url', v_job.after_photo_url,
      'created_at', v_job.created_at,
      'updated_at', v_job.updated_at
    ),
    'order', case when v_job.order_id is null then null else (
      select jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'project_name', o.project_name,
        'status', o.status,
        'installation_status', o.installation_status,
        'layout_link', o.layout_link,
        'installation_address', o.installation_address,
        'installation_scheduled_at', o.installation_scheduled_at,
        'installation_completed_at', o.installation_completed_at,
        'installer_name', o.installer_name,
        'installer_phone', o.installer_phone,
        'current_stage', o.current_stage,
        'stage_updated_at', o.stage_updated_at,
        'updated_at', o.updated_at
      )
      from public.leader_orders o
      where o.id = v_job.order_id
    ) end,
    'production', case when v_job.production_job_id is null then null else (
      select jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'production_status', p.production_status,
        'layout_status', p.layout_status,
        'priority', p.priority,
        'deadline', p.deadline,
        'ready_at', p.ready_at,
        'file_url', p.file_url,
        'technical_task', p.technical_task,
        'updated_at', p.updated_at
      )
      from public.leader_production_jobs p
      where p.id = v_job.production_job_id
    ) end,
    'items', coalesce((
      select jsonb_agg(item_obj order by created_at asc)
      from (
        select i.created_at,
               jsonb_build_object(
                 'id', i.id,
                 'name', i.name,
                 'unit', i.unit,
                 'qty', i.qty,
                 'width', i.width,
                 'height', i.height,
                 'comment', i.comment,
                 'created_at', i.created_at
               ) as item_obj
        from public.leader_installation_job_items i
        where i.job_id = v_job.id
        order by i.created_at asc
        limit 120
      ) q
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(event_obj order by created_at desc)
      from (
        select e.created_at,
               jsonb_build_object(
                 'id', e.id,
                 'event_type', e.event_type,
                 'old_status', e.old_status,
                 'new_status', e.new_status,
                 'body', e.body,
                 'created_at', e.created_at
               ) as event_obj
        from public.leader_installation_events e
        where e.job_id = v_job.id
        order by e.created_at desc
        limit 30
      ) q
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(comment_obj order by created_at desc)
      from (
        select c.created_at,
               jsonb_build_object(
                 'id', c.id,
                 'comment_type', c.comment_type,
                 'body', c.body,
                 'created_at', c.created_at
               ) as comment_obj
        from public.leader_installation_comments c
        where c.job_id = v_job.id
          and lower(btrim(coalesce(c.comment_type, ''))) <> 'internal'
        order by c.created_at desc
        limit 20
      ) q
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object('code', 'read_failed', 'message', 'Installation job could not be read')
  );
end
$function$;

revoke all on function public.leader_read_installation_job_rpc(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leader_read_installation_job_rpc(uuid, uuid) to service_role;
