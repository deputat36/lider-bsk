#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_PATH = ROOT / "crm/v4/assets/v4/lead-workflow-staging-ui-v1.js"
MODEL_PATH = ROOT / "crm/v4/assets/v4/lead-workflow-staging-list-model-v1.js"
TRANSPORT_PATH = ROOT / "crm/v4/assets/v4/lead-workflow-staging-transport-v1.js"

ui = UI_PATH.read_text(encoding="utf-8")
model = MODEL_PATH.read_text(encoding="utf-8")
transport = TRANSPORT_PATH.read_text(encoding="utf-8")

required_ui_fragments = [
    "buildStagingLeadListWorkflowAction",
    "target.closest('#leadsSection')",
    "button[data-action]",
    "['take', 'work']",
    "loadCurrentLeadVersion",
    ".select('id,status,assigned_to,next_contact_at,updated_at')",
    "context: 'list'",
    "source: action.context === 'list' ? 'lead_list' : 'lead_card'",
    "event.stopImmediatePropagation()",
    "document.addEventListener('click', interceptStagingWorkflow, true)",
    "route.mode !== 'staging_edge'",
    "refreshList({ openLeadId: leadId })",
]

required_model_fragments = [
    "export function buildStagingLeadListWorkflowAction",
    "assigned_to: actorId",
    "status: 'В работе'",
    "Заявка уже назначена",
    "Сначала назначьте себя ответственным",
]

required_transport_fragments = [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "hostname === STAGING_HOSTNAME",
    "mode: 'staging_edge'",
    "browserDirectWrite: false",
    "mode: 'production_legacy'",
    "browserDirectWrite: true",
]

missing = []
for fragment in required_ui_fragments:
    if fragment not in ui:
        missing.append(f"UI missing: {fragment}")
for fragment in required_model_fragments:
    if fragment not in model:
        missing.append(f"model missing: {fragment}")
for fragment in required_transport_fragments:
    if fragment not in transport:
        missing.append(f"transport missing: {fragment}")

for forbidden in [
    "from('leader_lead_events').insert",
    ".from(\"leader_lead_events\").insert",
]:
    if forbidden in ui:
        missing.append(f"browser duplicate history write present: {forbidden}")

if "action.lead || v4State.currentLead" not in ui:
    missing.append("explicit list/card lead selection is missing")

if "ofewxuqfjhamgerwzull" in transport:
    missing.append("production project ref must not be embedded in staging transport")

if missing:
    raise SystemExit("\n".join(missing))

print("crm staging lead list workflow: ok")
