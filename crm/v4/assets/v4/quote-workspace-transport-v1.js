import { quoteEnvironment, quoteUuid, quoteErrorMessage, QUOTE_WRITES } from './quote-workspace-model-v1.js';
const READS = ['list','detail','assignees','selection','template.list','template.get'];
export function quoteCommand(operation, payload = {}, { requestId, revision } = {}) {
  if (![...READS, ...QUOTE_WRITES].includes(operation)) throw Error('unknown_action');
  const command = { operation, payload: structuredClone(payload) };
  if (QUOTE_WRITES.includes(operation)) {
    command.request_id = requestId || crypto.randomUUID();
    if (!quoteUuid(command.request_id)) throw Error('invalid_payload');
    if (operation !== 'create') {
      if (!Number.isInteger(revision) || revision < 1) throw Error('invalid_payload');
      command.expected_revision = revision;
    }
  }
  return command;
}
export async function invokeQuoteCommand({ client, supabaseUrl, actorId, command, allowed = false }) {
  const fail = code => ({ ok: false, code, uncertain: code === 'quote_command_failed', message: quoteErrorMessage(code) });
  if (!quoteEnvironment(supabaseUrl)) return fail('environment_locked');
  if (!allowed) return fail('forbidden');
  try {
    const session = await client.auth.getSession();
    const current = session?.data?.session;
    if (session?.error || !actorId || current?.user?.id !== actorId || !current?.access_token) return fail('auth_required');
    const response = await client.functions.invoke('leader-crm-quotes', { body: command, headers: { Authorization: `Bearer ${current.access_token}` } });
    let data = response?.data;
    if (response?.error) {
      try { data = await response.error.context.clone().json(); } catch (_) { return fail('quote_command_failed'); }
    }
    if (data?.ok !== true) return fail(data?.error?.code || 'quote_command_failed');
    return data;
  } catch (_) { return fail('quote_command_failed'); }
}
