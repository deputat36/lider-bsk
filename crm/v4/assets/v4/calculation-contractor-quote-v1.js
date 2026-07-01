import { v4State } from './state.js';
import { byId } from './ui.js';

const VERSION = 'contractor-quote-v1-20260701';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function num(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function value(id) {
  return byId(id)?.value?.trim() || '';
}

function totals() {
  const base = num(value('contractorQuoteBase'));
  const delivery = num(value('contractorQuoteDelivery'));
  const installation = num(value('contractorQuoteInstallation'));
  const design = num(value('contractorQuoteDesign'));
  const other = num(value('contractorQuoteOther'));
  const markup = num(value('contractorQuoteMarkup')) || 25;
  const manualClient = num(value('contractorQuoteClient'));
  const cost = base + delivery + installation + design + other;
  const autoClient = Math.ceil((cost * (1 + markup / 100)) / 10) * 10;
  const client = manualClient > 0 ? manualClient : autoClient;
  const profit = client - cost;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  return { cost, client, profit, margin };
}

function renderPreview() {
  const box = byId('contractorQuotePreview');
  if (!box) return;
  const t = totals();
  const cls = t.profit < 0 ? 'is-error' : t.margin < 20 ? 'is-warn' : 'is-good';
  box.className = `v4-calc-live ${cls}`;
  box.innerHTML = `<span><b>Себестоимость:</b> ${money(t.cost)}</span><span><b>Клиенту:</b> ${money(t.client)}</span><span><b>Прибыль:</b> ${money(t.profit)}</span><span><b>Маржа:</b> ${Math.round(t.margin)}%</span>`;
}

function renderShell() {
  const host = byId('calculationsBox');
  if (!host || !v4State.route.leadId || !v4State.crmReady || byId('contractorQuoteV1')) return;
  host.insertAdjacentHTML('beforeend', `
    <section id="contractorQuoteV1" class="v4-subcard v4-calculations-section" data-contractor-quote-version="${VERSION}">
      <div class="v4-subcard-head"><div><h3>Подрядный расчёт v2</h3><p>Первый шаг нового конструктора: цена подрядчика + доставка + монтаж + дизайн + прочие расходы + маржа. По умолчанию для клиента это должна быть одна итоговая строка.</p></div><span class="v4-muted">${VERSION}</span></div>
      <div class="v4-form-grid">
        <label>Название для клиента<input id="contractorQuoteTitle" placeholder="Например: фасадная вывеска под ключ"></label>
        <label>Подрядчик<input id="contractorQuoteVendor" placeholder="Кто посчитал или изготовит"></label>
        <label>Цена подрядчика, ₽<input id="contractorQuoteBase" type="number" min="0" step="1" value="0"></label>
        <label>Доставка, ₽<input id="contractorQuoteDelivery" type="number" min="0" step="1" value="0"></label>
        <label>Монтаж, ₽<input id="contractorQuoteInstallation" type="number" min="0" step="1" value="0"></label>
        <label>Дизайн, ₽<input id="contractorQuoteDesign" type="number" min="0" step="1" value="0"></label>
        <label>Прочее, ₽<input id="contractorQuoteOther" type="number" min="0" step="1" value="0"></label>
        <label>Наценка, %<input id="contractorQuoteMarkup" type="number" min="0" step="1" value="25"></label>
        <label>Итог клиенту вручную, ₽<input id="contractorQuoteClient" type="number" min="0" step="1" placeholder="пусто = авто"></label>
        <label class="wide">Комментарий<input id="contractorQuoteComment" placeholder="Что входит в готовую стоимость"></label>
      </div>
      <div id="contractorQuotePreview" class="v4-calc-live is-warn"></div>
      <p class="v4-muted">Сохранение этого режима будет следующим шагом: данные будут писаться в существующие `leader_lead_calculations` и `leader_lead_calculation_items.data` без изменения схемы.</p>
    </section>`);
  renderPreview();
}

document.addEventListener('input', (event) => {
  if (event.target?.id?.startsWith('contractorQuote')) renderPreview();
});
['leader-v4:lead-card-rendered', 'leader-v4:needs-loaded', 'leader-v4:crm-ready', 'leader-v4:route-change'].forEach((name) => {
  document.addEventListener(name, () => setTimeout(renderShell, 0));
});
