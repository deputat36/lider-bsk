const STAGING_HOST = 'otulfnouybahfnsycxqn.supabase.co';
const FUNCTION_SLUG = 'leader-crm-workflow';

export function isStagingWorkflowEnvironment(value) {
  try { return new URL(value).hostname === STAGING_HOST; } catch (_) { return false; }
}
function uuid() {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error('secure_request_id_unavailable');
  return value;
}
export async function invokeStagingWorkflow({ client, supabaseUrl, action, entity, status, layoutLink = '' }) {
  if (!isStagingWorkflowEnvironment(supabaseUrl)) throw new Error('wrong_environment');
  const idField = action === 'offer.transition' ? 'offer_id' : 'task_id';
  const id = String(entity?.id || '').trim();
  const expected = String(entity?.updated_at || '').trim();
  if (!id || !expected) throw new Error('stale_entity_missing');
  const body = {
    action,
    request_id: uuid(),
    expected_updated_at: expected,
    payload: {
      [idField]: id,
      idempotency_key: `${action}:${id}:${String(status).trim()}:v1`,
      status: String(status).trim(),
      ...(action === 'design_task.transition' ? { layout_link: String(layoutLink || '').trim() || null } : {})
    }
  };
  const response = await client.functions.invoke(FUNCTION_SLUG, { body });
  if (response?.error || response?.data?.ok !== true) {
    const code = response?.data?.error?.code || response?.error?.message || 'workflow_failed';
    throw new Error(String(code));
  }
  return response.data;
}
