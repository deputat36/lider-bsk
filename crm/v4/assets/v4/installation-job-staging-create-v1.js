import { CRM_V4_ACTIONS, canPerformV4Action } from './action-permissions-v1.js';
import { operationalProductionAvailable } from './operational-production-gate-v1.js';
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
    supabaseClient.from('leader_orders').select('id,project_name,installation_address,installation_scheduled_at,installer_name,updated_at').eq('id', orderId).single(),
    supabaseClient.from('leader_production_jobs').select('id,order_id,title,production_status,updated_at').eq('id', productionId).single()
  ]);
  if (orderResponse.error || productionResponse.error) throw orderResponse.error || productionResponse.error;
  return { order: orderResponse.data, production: productionResponse.data };
}
async function open(orderId, productionId) {
  if (!canPerformV4Action(CRM_V4_ACTIONS.INSTALLATION_WRITE) || !canPerformV4Action(CRM_V4_ACTIONS.ORDERS_READ)) return;
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
    const stagingFixture = isStagingInstallationEnvironment(V4_CONFIG.supabaseUrl);
    const name = bundle.order.project_name || 'заказ';
    const schedule = stagingFixture ? new Date(Date.now()+86400000).toISOString().slice(0,16) : '';
    modal.innerHTML = `<div class="v4-install-card"><div class="v4-install-head"><div><h2>Создать монтаж</h2><p>${esc(bundle.order.project_name || 'Заказ')}</p></div><button type="button" data-installation-staging-close>Закрыть</button></div><div class="v4-install-empty">Монтаж создаётся только из готового производства. Повтор команды не создаёт дубль.</div><div class="v4-install-form" style="display:grid;gap:12px;margin:16px 0"><label>Название задания<input id="installationCreateTitle" value="${esc(`Монтаж ${name}`)}" maxlength="400"></label><label>Адрес монтажа<input id="installationCreateAddress" value="${esc(bundle.order.installation_address || (stagingFixture ? `Synthetic address ${name}` : ''))}" maxlength="800" required></label><label>Дата и время<input id="installationCreateSchedule" type="datetime-local" value="${esc(schedule)}" required></label><label>Исполнитель<input id="installationCreateInstaller" value="${esc(bundle.order.installer_name || (stagingFixture ? `Synthetic installer ${name}` : ''))}" maxlength="200"></label><label>Задание<textarea id="installationCreateTask" maxlength="8000">${esc(stagingFixture ? `Synthetic installation ${name}` : '')}</textarea></label></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-installation-staging-confirm>Создать монтаж</button></div></div>`;
  } catch (error) {
    modal.innerHTML = `<div class="v4-install-card"><div class="v4-install-head"><h2>Монтаж</h2><button type="button" data-installation-staging-close>Закрыть</button></div><div class="v4-install-empty">${esc(friendlyError(error))}</div></div>`;
  }
}
async function create() {
  if (busy || !canPerformV4Action(CRM_V4_ACTIONS.INSTALLATION_WRITE) || !canPerformV4Action(CRM_V4_ACTIONS.ORDERS_READ)) return;
  const modal = document.getElementById(MODAL_ID);
  const order = JSON.parse(modal?.dataset.order || 'null');
  const production = JSON.parse(modal?.dataset.production || 'null');
  if (!order?.id || !production?.id) return;
  busy = true;
  try {
    const value = id => String(modal.querySelector('#'+id)?.value || '').trim();
    const address = value('installationCreateAddress');
    const scheduledInput = value('installationCreateSchedule');
    if (!address) throw new Error('Укажите адрес монтажа');
    if (!scheduledInput || !Number.isFinite(Date.parse(scheduledInput))) throw new Error('Укажите дату и время монтажа');
    const scheduled = new Date(scheduledInput).toISOString();
    const title = value('installationCreateTitle');
    if (!title) throw new Error('Укажите название задания');
    const command = {
      action: 'installation_job.create_from_order',
      request_id: globalThis.crypto.randomUUID(),
      expected_updated_at: order.updated_at,
      payload: {
        order_id: order.id,
        production_job_id: production.id,
        idempotency_key: `installation_job.create_from_order:${order.id}:v1`,
        job: {
          title,
          priority: 'Обычный',
          installer_name: value('installationCreateInstaller') || null,
          installer_phone: null,
          address,
          scheduled_at: scheduled,
          technical_task: value('installationCreateTask') || null,
          tools_required: null
        }
      }
    };
    const result = await supabaseClient.functions.invoke('leader-crm-installation-create', { body: command });
    if (result.error || result.data?.ok !== true) throw new Error(result.data?.error?.code || result.error?.message || 'installation_create_failed');
    const createdJobId = result.data?.entity?.id || result.data?.job?.id;
    if (!createdJobId) throw new Error('installation_response_entity_missing');
    const replay = await supabaseClient.functions.invoke('leader-crm-installation-create', { body: {
      ...command,
      request_id: globalThis.crypto.randomUUID()
    } });
    if (replay.error || replay.data?.ok !== true || replay.data?.idempotent_replay !== true
      || (replay.data?.entity?.id || replay.data?.job?.id) !== createdJobId) {
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
if ((isStagingInstallationEnvironment(V4_CONFIG.supabaseUrl) || operationalProductionAvailable(V4_CONFIG.supabaseUrl)) && !window.LeaderV4InstallationStagingCreateV1Booted) {
  window.LeaderV4InstallationStagingCreateV1Booted = true;
  boot();
}
