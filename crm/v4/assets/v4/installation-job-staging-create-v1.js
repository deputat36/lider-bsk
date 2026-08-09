import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { friendlyError } from './api.js';
import { toast } from './ui.js';
import { isStagingInstallationEnvironment } from './installation-job-staging-transport-v1.js';

const MODAL_ID = 'installationStagingCreateV1';
let busy = false;
function esc(value) { return String(value ?? '').replace(/[&<>\"]/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[m])); }
function close() { document.getElementById(MODAL_ID)?.remove(); busy = false; }
async function load(orderId, productionId) {
  const [orderResponse, productionResponse] = await Promise.all([
    supabaseClient.from('leader_orders').select('id,project_name,updated_at').eq('id', orderId).single(),
    supabaseClient.from('leader_production_jobs').select('id,order_id,title,production_status,updated_at').eq('id', productionId).single()
  ]);
  if (orderResponse.error || productionResponse.error) throw orderResponse.error || productionResponse.error;
  return { order: orderResponse.data, production: productionResponse.data };
}
async function open(orderId, productionId) {
  close();
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'v4-install-modal';
  modal.innerHTML = '<div class="v4-install-card"><div class="v4-install-empty">Проверяю готовность производства…</div></div>';
  document.body.appendChild(modal);
  try {
    const bundle = await load(orderId, productionId);
    modal.dataset.order = JSON.stringify(bundle.order);
    modal.dataset.production = JSON.stringify(bundle.production);
    modal.innerHTML = `<div class="v4-install-card"><div class="v4-install-head"><div><h2>Создать монтаж в staging</h2><p>${esc(bundle.order.project_name || 'Synthetic order')}</p></div><button type="button" data-installation-staging-close>Закрыть</button></div><div class="v4-install-empty">Монтаж создаётся только из готового производства. Повтор команды не создаёт дубль.</div><div class="v4-install-actions"><button type="button" class="v4-primary" data-installation-staging-confirm>Создать монтаж</button></div></div>`;
  } catch (error) {
    modal.innerHTML = `<div class="v4-install-card"><div class="v4-install-head"><h2>Монтаж</h2><button type="button" data-installation-staging-close>Закрыть</button></div><div class="v4-install-empty">${esc(friendlyError(error))}</div></div>`;
  }
}
async function create() {
  if (busy) return;
  const modal = document.getElementById(MODAL_ID);
  const order = JSON.parse(modal?.dataset.order || 'null');
  const production = JSON.parse(modal?.dataset.production || 'null');
  if (!order?.id || !production?.id) return;
  busy = true;
  try {
    const marker = String(order.project_name || `synthetic-${order.id}`).slice(0, 180);
    const scheduled = new Date(Date.now() + 86400000).toISOString();
    const command = {
      action: 'installation_job.create_from_order',
      request_id: globalThis.crypto.randomUUID(),
      expected_updated_at: order.updated_at,
      payload: {
        order_id: order.id,
        production_job_id: production.id,
        idempotency_key: `installation_job.create_from_order:${order.id}:v1`,
        job: {
          title: `Монтаж ${marker}`,
          priority: 'Обычный',
          installer_name: `Synthetic installer ${marker}`,
          installer_phone: null,
          address: `Synthetic address ${marker}`,
          scheduled_at: scheduled,
          installer_cost: 0,
          client_price: 0,
          technical_task: `Synthetic installation ${marker}`,
          tools_required: null
        }
      }
    };
    const result = await supabaseClient.functions.invoke('leader-crm-installation-create', { body: command });
    if (result.error || result.data?.ok !== true) throw new Error(result.data?.error?.code || result.error?.message || 'installation_create_failed');
    const replay = await supabaseClient.functions.invoke('leader-crm-installation-create', { body: {
      ...command,
      request_id: globalThis.crypto.randomUUID()
    } });
    if (replay.error || replay.data?.ok !== true || replay.data?.idempotent_replay !== true
      || replay.data?.job?.id !== result.data?.job?.id) {
      throw new Error(replay.data?.error?.code || replay.error?.message || 'installation_replay_verification_failed');
    }
    toast(result.data.idempotent_replay ? 'Монтаж уже существует — дубль не создан' : 'Монтаж создан, безопасный повтор подтверждён');
    close();
    document.querySelector('[data-production-light-refresh]')?.click();
  } catch (error) { toast(friendlyError(error)); busy = false; }
}
function boot() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-installation-staging-create]');
    if (trigger) { event.preventDefault(); open(trigger.dataset.installationOrder, trigger.dataset.installationStagingCreate); return; }
    if (event.target.closest?.('[data-installation-staging-close]')) { event.preventDefault(); close(); return; }
    if (event.target.closest?.('[data-installation-staging-confirm]')) { event.preventDefault(); create(); }
  }, true);
}
if (isStagingInstallationEnvironment(V4_CONFIG.supabaseUrl) && !window.LeaderV4InstallationStagingCreateV1Booted) {
  window.LeaderV4InstallationStagingCreateV1Booted = true;
  boot();
}
