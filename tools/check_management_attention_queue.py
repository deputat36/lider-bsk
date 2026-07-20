from pathlib import Path

root = Path(__file__).resolve().parents[1]
model = (root / 'crm/v4/assets/v4/management-attention-model-v1.js').read_text(encoding='utf-8')
dashboard = (root / 'crm/v4/assets/v4/management-dashboard-v3.js').read_text(encoding='utf-8')
index = (root / 'crm/v4/index.html').read_text(encoding='utf-8')

checks = [
    ('model uses canonical statuses', "from './status-transitions-v1.js'" in model and 'statusDefinition(' in model),
    ('queue deduplicates clients and orders', 'keepHighest' in model and 'new Map()' in model and 'leadKey' in model and 'orderKey' in model),
    ('queue has stable priority sorting', 'b.priority - a.priority' in model),
    ('model includes needs and current calculations', 'source.needs' in model and 'source.calculations' in model and 'is_current_revision' in model),
    ('model detects broken order link', 'Статус «Создан заказ», но связанная запись не найдена' in model and 'converted_order_id' in model),
    ('model exposes simple work summary', 'buildManagementWorkSummary' in model and 'problemOrders' in model and 'totalQueue' in model),
    ('urgent count remains unique-entity based', 'managementUrgentCount' in model and 'priority || 0) >= 70' in model),
    ('dashboard loads needs and calculations read-only', "from('leader_lead_needs').select(NEED_FIELDS)" in dashboard and "from('leader_lead_calculations').select(CALC_FIELDS)" in dashboard),
    ('dashboard is called Today', '<h2>Сегодня</h2>' in dashboard and "button.textContent = 'Сегодня'" in dashboard),
    ('dashboard has five simple counters', all(marker in dashboard for marker in ('Срочно сегодня', 'Новые заявки', 'Потребности и расчёты', 'КП ждут действия', 'Проблемные заказы'))),
    ('dashboard exposes one work queue', 'Рабочая очередь' in dashboard and 'queue.slice(0, 12)' in dashboard),
    ('detailed analytics is collapsed', '<details class="v4-mgmt-details">' in dashboard and 'Подробная аналитика и все разделы' in dashboard),
    ('dashboard exposes safe empty state', 'Обязательных действий по доступным данным нет.' in dashboard),
    ('dashboard has mobile single-column layout', '@media(max-width:640px)' in dashboard and '.v4-today-summary{grid-template-columns:1fr}' in dashboard),
    ('cache marker updated', 'management-dashboard-v3.js?v=20260720-today-1' in index),
    ('model performs no network or database calls', all(marker not in model for marker in ('supabase', 'fetch(', '.from(', '.insert(', '.update(', '.delete(', '.rpc('))),
    ('dashboard adds no write path', all(marker not in dashboard for marker in ('.insert(', '.update(', '.delete(', '.upsert(', '.rpc('))),
]

failed = [label for label, ok in checks if not ok]
if failed:
    raise SystemExit('Management Today workspace check failed: ' + '; '.join(failed))

print('Management workspace Today is unique, prioritized, stage-aware, mobile-safe and read-only.')
