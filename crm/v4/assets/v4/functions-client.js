import { V4_CONFIG } from './config.js';
import { fetchJson } from './api.js';
import { supabaseClient } from './supabase-client.js';

export async function invokeLeaderFunction(name, body, options = {}) {
  const sessionResult = await supabaseClient.auth.getSession();
  const session = sessionResult?.data?.session || null;
  if (!session?.access_token) throw new Error('Сначала войдите в CRM');

  const headers = {
    apikey: V4_CONFIG.supabasePublishableKey,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };

  const { data } = await fetchJson(
    `${V4_CONFIG.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`,
    { method: 'POST', headers, body: JSON.stringify(body || {}) },
    options.timeoutMs || 20000,
    options.timeoutMessage || 'Функция Supabase не ответила вовремя'
  );

  if (data?.error) {
    throw new Error(`${data.error}${data.details ? `: ${data.details}` : ''}`);
  }
  return data || {};
}
