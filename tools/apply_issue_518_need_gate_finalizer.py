#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEEDS = ROOT / 'crm/v4/assets/v4/needs.js'
text = NEEDS.read_text(encoding='utf-8')
old = "    if (edit) { const need = needFromAction(edit); if (need && requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) openNeedForm('edit', need); return; }"
new = "    if (edit) { const need = needFromAction(edit); if (need && requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) { calculationGateNeedId = null; openNeedForm('edit', need); } return; }"
if text.count(old) != 1:
    raise RuntimeError(f'edit gate reset marker: expected 1 occurrence, got {text.count(old)}')
NEEDS.write_text(text.replace(old, new, 1), encoding='utf-8')
print('issue 518 edit gate reset applied')
