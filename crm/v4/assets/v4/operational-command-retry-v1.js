const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Only the current in-memory card session is retained. Nothing is written to storage.
export function createOperationalCommandRetry() {
  const pending = new Map();
  function fingerprint(context) {
    const patch = Object.fromEntries(Object.entries(context.patch).sort(([a], [b]) => a.localeCompare(b)));
    return JSON.stringify([context.supabaseUrl, context.actorId, context.action,
      context.jobId, context.expectedUpdatedAt, patch]);
  }
  return Object.freeze({
    prepare(context, cryptoObject = globalThis.crypto) {
      if (!UUID.test(context.actorId || '') || !UUID.test(context.jobId || '')
        || !['production_job.update', 'installation_job.update'].includes(context.action)
        || !Number.isFinite(Date.parse(context.expectedUpdatedAt))
        || !context.patch || typeof context.patch !== 'object' || Array.isArray(context.patch)) {
        throw new Error('operational_retry_context_invalid');
      }
      const key = fingerprint(context);
      if (pending.has(key)) return pending.get(key);
      const requestId = cryptoObject?.randomUUID?.();
      if (!UUID.test(requestId || '')) throw new Error('secure_request_id_unavailable');
      const command = Object.freeze({
        action: context.action,
        request_id: requestId,
        expected_updated_at: context.expectedUpdatedAt,
        payload: Object.freeze({job_id: context.jobId,
          idempotency_key: `${context.action}:${context.jobId}:${requestId}`,
          patch: Object.freeze({...context.patch})})
      });
      pending.set(key, command);
      return command;
    },
    confirm(command) {
      for (const [key, value] of pending) if (value === command) pending.delete(key);
    }
  });
}
