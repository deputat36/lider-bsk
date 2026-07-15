from pathlib import Path

root = Path(__file__).resolve().parents[1]
model = (root / 'crm/v4/assets/v4/management-attention-model-v1.js').read_text(encoding='utf-8')
dashboard = (root / 'crm/v4/assets/v4/management-dashboard-v3.js').read_text(encoding='utf-8')
index = (root / 'crm/v4/index.html').read_text(encoding='utf-8')

checks = [
    ('model uses canonical statuses', "from './status-transitions-v1.js'" in model and 'statusDefinition(' in model),
    ('queue deduplicates entities', 'keepHighest' in model and 'new Map()' in model),
    ('queue has stable priority sorting', 'b.priority - a.priority' in model),
    ('urgent count is unique-entity based', 'managementUrgentCount' in model and 'priority || 0) >= 70' in model),
    ('dashboard imports queue', "from './management-attention-model-v1.js'" in dashboard),
    ('dashboard explains next action', 'Что сделать сейчас' in dashboard and 'наиболее важное действие' in dashboard),
    ('dashboard exposes safe empty state', 'Срочных действий по доступным данным нет.' in dashboard),
    ('dashboard has mobile action layout', '@media(max-width:640px)' in dashboard and 'v4-mgmt-attention-item button' in dashboard),
    ('cache marker updated', 'management-dashboard-v3.js?v=20260715-attention-1' in index),
    ('model performs no network or database calls', all(marker not in model for marker in ('supabase', 'fetch(', '.from(', '.insert(', '.update(', '.delete(', '.rpc('))),
]

failed = [label for label, ok in checks if not ok]
if failed:
    raise SystemExit('Management attention queue check failed: ' + '; '.join(failed))

print('Management attention queue is unique, prioritized, registry-backed and read-only.')
