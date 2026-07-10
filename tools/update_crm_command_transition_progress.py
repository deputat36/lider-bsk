#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'docs' / 'CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md'
text = path.read_text(encoding='utf-8')
original = text

anchor = '''- `production_job.update`;
- `installation_job.update`;
- manual order transaction.

### Catalog-backed calculation items
'''
replacement = '''- `production_job.update`;
- `installation_job.update`;
- manual order transaction.

### Command and transition registry

Добавлены:

- machine-readable contract `contracts/crm-v4-command-transition-registry-v1.json`;
- specification `docs/CRM_V4_COMMAND_TRANSITION_REGISTRY_2026-07-10.md`;
- checker `tools/check_crm_v4_command_transition_registry.py`;
- dedicated workflow `.github/workflows/crm-v4-command-transition-registry-check.yml`.

Registry version: `leader-command-transitions-v1`; текущий режим: `source_only_not_enforced`.

Source contract фиксирует:

- `calculation.save`;
- `offer.create_from_calculation` и `offer.transition`;
- `order.create_from_offer`, `order.create_manual` и `order.transition`;
- `lead.transition`;
- `production_job.update`;
- `installation_job.update`;
- canonical permission, transaction, optimistic concurrency, payload/result и audit contract для каждой команды;
- transition graph для lead, calculation, offer, order, production job и installation job;
- compatibility states из live данных без автоматической перезаписи production-строк.

Server-side enforcement, development-branch implementation and integration proof (#204) всё ещё требуются.

### Catalog-backed calculation items
'''
if anchor in text:
    text = text.replace(anchor, replacement, 1)
elif '### Command and transition registry' not in text:
    raise SystemExit('backend inventory insertion anchor not found')

text = text.replace(
    '- backend write inventory checker;\n- completion act checker;',
    '- backend write inventory checker;\n- command transition registry checker;\n- completion act checker;',
    1,
)
text = text.replace(
    '- dedicated completion act workflow;\n- consolidated full-audit workflow.',
    '- dedicated completion act workflow;\n- dedicated command transition registry workflow;\n- consolidated full-audit workflow.',
    1,
)
text = text.replace(
    '- подтверждены client-facing поля заказа, клиента и позиций для source-only preview.',
    '- подтверждены client-facing поля заказа, клиента и позиций для source-only preview;\n- read-only inventory подтвердил live statuses и наличие `leader_lead_events`, `leader_commercial_offer_events`, `leader_production_events`, `leader_installation_events`, `leader_activity_log` для command/audit contract.',
    1,
)
text = text.replace(
    '- transaction-backed commands from backend inventory (#204);',
    '- development-branch implementation and integration proof (#204);',
    1,
)
text = text.replace('- centralized status registry;\n', '', 1)
text = text.replace(
    '''1. Add status/action transition registry for transaction-backed commands.
2. Expand manual browser evidence checklists, including completion act print proof.
3. Prepare development-branch test specifications for #201/#202/#204/#214.
4. Add organization legal-settings source contract without production persistence.
5. Keep #200 updated with completed and approval-gated work.''',
    '''1. Prepare development-branch test specifications for #201/#202/#204/#214.
2. Expand manual browser evidence checklists, including completion act print proof.
3. Add organization legal-settings source contract without production persistence.
4. Prepare generated server-registry compatibility test without deploying Edge Functions.
5. Keep #200 updated with completed and approval-gated work.''',
    1,
)

if text == original:
    print('already-applied')
else:
    path.write_text(text, encoding='utf-8')
    print('changed')
