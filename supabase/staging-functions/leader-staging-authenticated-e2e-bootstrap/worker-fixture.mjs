// Only synthetic rows owned by this signed GitHub run are eligible.
export function workerFixtureTools({ service, rpc, inspect }) {
  const assert = (value, code) => { if (!value) throw Error(code); };
  async function rows(table, query) {
    const result = await service('/rest/v1/' + table + '?' + query);
    assert(result.ok && Array.isArray(result.body), 'worker_read_failed:' + table);
    return result.body;
  }
  async function context(marker, runKey, manager = true) {
    const fixture = await inspect(marker);
    assert(fixture.user_id && fixture.lead_id, 'worker_fixture_missing');
    const profiles = await rows('leader_user_profiles', 'select=user_id,role,is_active,permissions&user_id=eq.' + fixture.user_id);
    const profile = profiles[0];
    assert(profiles.length === 1 && profile.permissions?.synthetic_marker === marker && profile.permissions?.run_key === runKey, 'worker_run_binding_failed');
    if (manager) assert(profile.role === 'manager' && profile.is_active === true, 'worker_manager_required');
    return fixture;
  }
  async function command(name, actor, action, revision, payload) {
    const result = await rpc(name, { p_payload: { actor_id: actor, request: { action, request_id: crypto.randomUUID(), expected_updated_at: revision, payload } } });
    assert(result.ok && result.body.ok === true, 'worker_command_failed:' + action + ':' + (result.body.error?.code || result.status));
    return result.body;
  }
  async function orderFor(fixture, marker) {
    const orders = await rows('leader_orders', 'select=id,owner_id,lead_id,project_name,updated_at&lead_id=eq.' + fixture.lead_id + '&project_name=eq.' + encodeURIComponent(marker + '-WORKER'));
    assert(orders.length === 1 && orders[0].owner_id === fixture.user_id, 'worker_order_binding_failed');
    return orders[0];
  }
  async function prepare(marker, runKey) {
    const fixture = await context(marker, runKey);
    const existing = await rows('leader_orders', 'select=id&lead_id=eq.' + fixture.lead_id + '&project_name=eq.' + encodeURIComponent(marker + '-WORKER'));
    assert(existing.length === 0, 'worker_fixture_already_exists');
    const inserted = await service('/rest/v1/leader_orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ owner_id: fixture.user_id, lead_id: fixture.lead_id, project_name: marker + '-WORKER', status: 'Новый', client_name: 'Synthetic worker fixture', data: { synthetic_marker: marker } }) });
    assert(inserted.ok && inserted.body[0]?.id, 'worker_order_create_failed');
    const order = inserted.body[0];
    const needs = await rows('leader_lead_needs', 'select=id,need_design&lead_id=eq.' + fixture.lead_id);
    assert(needs.length === 1 && needs[0].need_design === true, 'worker_need_missing');
    const design = await command('leader_create_design_task_from_order_rpc', fixture.user_id, 'design_task.create_from_order', order.updated_at, { order_id: order.id, need_ids: [needs[0].id], idempotency_key: marker + ':worker-design', task: { title: marker + '-WORKER-DESIGN', priority: 'Обычный', task_text: 'Synthetic worker layout', reference_link: 'https://example.invalid/reference' } });
    assert(design.entity?.id, 'worker_design_id_missing');
    return { ok: true, action: 'prepare_workers', worker_order_id: order.id, worker_task_id: design.entity.id };
  }
  async function advance(marker, runKey, target) {
    assert(['production', 'installation'].includes(target), 'worker_target_invalid');
    const fixture = await context(marker, runKey);
    let order = await orderFor(fixture, marker);
    if (target === 'production') {
      const tasks = await rows('leader_design_tasks', 'select=id,task_status,layout_link,updated_at&order_id=eq.' + order.id);
      assert(tasks.length === 1 && tasks[0].task_status === 'На согласовании' && tasks[0].layout_link === 'https://example.invalid/worker-layout', 'worker_design_not_reviewed');
      const task = tasks[0];
      await command('leader_transition_design_task_rpc', fixture.user_id, 'design_task.transition', task.updated_at, { task_id: task.id, status: 'Согласовано', layout_link: task.layout_link, idempotency_key: marker + ':worker-approve' });
      order = await orderFor(fixture, marker);
      const created = await command('leader_create_production_job_from_order_rpc', fixture.user_id, 'production_job.create_from_order', order.updated_at, { order_id: order.id, design_task_id: task.id, idempotency_key: marker + ':worker-production', job: { title: marker + '-WORKER-PRODUCTION', priority: 'Обычная', layout_status: 'Макет согласован', file_url: task.layout_link, technical_task: 'Synthetic worker production' } });
      return { ok: true, action: 'advance_workers', worker_production_id: created.entity.id };
    }
    const jobs = await rows('leader_production_jobs', 'select=id,production_status&order_id=eq.' + order.id);
    assert(jobs.length === 1 && jobs[0].production_status === 'Готово', 'worker_production_not_ready');
    const created = await command('leader_create_installation_job_from_order_rpc', fixture.user_id, 'installation_job.create_from_order', order.updated_at, { order_id: order.id, production_job_id: jobs[0].id, idempotency_key: marker + ':worker-installation', job: { title: marker + '-WORKER-INSTALLATION', priority: 'Обычный', installer_name: 'Synthetic installer', address: 'Synthetic staging address', scheduled_at: '2030-01-01T12:00:00Z', technical_task: 'Synthetic worker installation' } });
    return { ok: true, action: 'advance_workers', worker_installation_id: created.entity.id };
  }
  async function active(marker, runKey, enabled) {
    assert(typeof enabled === 'boolean', 'worker_active_invalid');
    const fixture = await context(marker, runKey, false);
    const result = await service('/rest/v1/leader_user_profiles?user_id=eq.' + fixture.user_id, { method: 'PATCH', body: JSON.stringify({ is_active: enabled }) });
    assert(result.ok, 'worker_active_failed');
    return { ok: true, action: 'set_worker_active', active: enabled };
  }
  async function verify(marker, runKey) {
    const fixture = await context(marker, runKey);
    const order = await orderFor(fixture, marker);
    const tasks = await rows('leader_design_tasks', 'select=id,task_status&order_id=eq.' + order.id);
    const production = await rows('leader_production_jobs', 'select=id,production_status&order_id=eq.' + order.id);
    const installation = await rows('leader_installation_jobs', 'select=id,install_status&order_id=eq.' + order.id);
    assert(tasks.length === 1 && tasks[0].task_status === 'Согласовано' && production.length === 1 && production[0].production_status === 'Готово' && installation.length === 1 && installation[0].install_status === 'Выполнен', 'worker_final_status_mismatch');
    const counts = {};
    for (const [kind, table, id] of [['design', 'leader_design_task_events', tasks[0].id], ['production', 'leader_production_events', production[0].id], ['installation', 'leader_installation_events', installation[0].id]]) {
      const events = await rows(table, 'select=id&' + (kind === 'design' ? 'task_id' : 'job_id') + '=eq.' + id);
      assert(events.length === 4, 'worker_audit_count:' + kind + ':' + events.length);
      counts[kind] = events.length;
    }
    return { ok: true, action: 'inspect_workers', completed: true, audit_counts: counts };
  }
  return { prepare, advance, active, verify };
}
