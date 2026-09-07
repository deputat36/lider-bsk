#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEEDS = ROOT / 'crm/v4/assets/v4/needs.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


needs = NEEDS.read_text(encoding='utf-8')
needs = replace_once(
    needs,
    "} from './need-workspace-model-v1.js';",
    "} from './need-workspace-model-v1.js';\nimport { needCalculationGateDecision } from './need-calculation-readiness-v1.js';",
    'readiness import'
)
needs = replace_once(
    needs,
    "let needsLoadSequence = 0;\nconst archiveBusy = new Set();",
    "let needsLoadSequence = 0;\nconst archiveBusy = new Set();\nlet calculationGateNeedId = null;",
    'gate state'
)
needs = replace_once(
    needs,
    "function resetWorkspace(leadId, mode = 'loading') {\n  saveBusy = false;\n  archiveBusy.clear();",
    "function resetWorkspace(leadId, mode = 'loading') {\n  saveBusy = false;\n  archiveBusy.clear();\n  calculationGateNeedId = null;",
    'gate reset'
)
needs = replace_once(
    needs,
    "  const canCalculate = canPerformV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE);\n  const duplicateClass =",
    "  const canCalculate = canPerformV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE);\n  const calculationDecision = needCalculationGateDecision(need);\n  const calculationGateOpen = calculationGateNeedId === need.id && calculationDecision.action === 'review';\n  const duplicateClass =",
    'card readiness state'
)
old_missing = "        ${missing.length ? `<div class=\"v4-need-missing\">Не хватает: ${missing.map(esc).join(', ')}</div>` : ''}\n      </div>"
new_missing = """        ${missing.length ? `<div class=\"v4-need-missing\">Не хватает: ${missing.map(esc).join(', ')}</div>` : ''}
        ${calculationGateOpen ? `<div class=\"v4-need-missing\" data-need-calculation-gate role=\"alert\">
          <b>Перед расчётом проверьте потребность</b>
          <p>${esc(calculationDecision.readiness.message)}</p>
          <div class=\"v4-need-actions\">
            ${canWrite ? '<button type=\"button\" data-action=\"edit-need\">Изменить потребность</button>' : ''}
            <button type=\"button\" class=\"v4-primary\" data-action=\"calculate-need-anyway\">Продолжить всё равно</button>
            <button type=\"button\" data-action=\"cancel-calculate-need\">Отмена</button>
          </div>
        </div>` : ''}
      </div>"""
needs = replace_once(needs, old_missing, new_missing, 'inline readiness gate')
old_click = """    const calculate = event.target.closest('button[data-action=\"calculate-need\"]');
    if (calculate) {
      const need = needFromAction(calculate);
      if (need && requireV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE)) document.dispatchEvent(new CustomEvent('leader-v4:calculate-need', { detail: { need } }));
      return;
    }
"""
new_click = """    const calculateAnyway = event.target.closest('button[data-action=\"calculate-need-anyway\"]');
    if (calculateAnyway) {
      const need = needFromAction(calculateAnyway);
      if (!need || !requireV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE)) return;
      const decision = needCalculationGateDecision(need, { continueAnyway: true });
      if (decision.action !== 'calculate') return;
      calculationGateNeedId = null;
      renderNeeds();
      document.dispatchEvent(new CustomEvent('leader-v4:calculate-need', { detail: { need, readinessOverride: true } }));
      return;
    }
    const cancelCalculationGate = event.target.closest('button[data-action=\"cancel-calculate-need\"]');
    if (cancelCalculationGate) {
      calculationGateNeedId = null;
      renderNeeds();
      return;
    }
    const calculate = event.target.closest('button[data-action=\"calculate-need\"]');
    if (calculate) {
      const need = needFromAction(calculate);
      if (!need || !requireV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE)) return;
      const decision = needCalculationGateDecision(need);
      if (decision.action === 'review') {
        calculationGateNeedId = need.id;
        renderNeeds();
        requestAnimationFrame(() => document.querySelector(`[data-id=\"${need.id}\"] [data-need-calculation-gate]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }));
        return;
      }
      calculationGateNeedId = null;
      document.dispatchEvent(new CustomEvent('leader-v4:calculate-need', { detail: { need } }));
      return;
    }
"""
needs = replace_once(needs, old_click, new_click, 'calculate click gate')
NEEDS.write_text(needs, encoding='utf-8')

loader = LOADER.read_text(encoding='utf-8')
loader = replace_once(
    loader,
    "import('./needs.js?v=20260805-tab-loader-1')",
    "import('./needs.js?v=20260907-readiness-gate-1')",
    'needs cache key'
)
LOADER.write_text(loader, encoding='utf-8')
print('issue 518 need calculation readiness gate applied')
