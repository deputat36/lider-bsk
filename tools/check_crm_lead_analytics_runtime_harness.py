#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
TEST = ROOT / 'tools' / 'test_crm_lead_analytics_runtime.mjs'
DOC = ROOT / 'docs' / 'CRM_LEAD_ANALYTICS_RUNTIME_HARNESS_2026-07-15.md'
MANUAL = ROOT / 'docs' / 'CRM_LEAD_ANALYTICS_BADGES_MANUAL_TEST_2026-07-09.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-lead-analytics-check.yml'

errors = []

for path in (TEST, DOC, MANUAL, WORKFLOW):
    if not path.is_file():
        errors.append(f'Missing required file: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

test = TEST.read_text(encoding='utf-8')
doc = DOC.read_text(encoding='utf-8')
manual = MANUAL.read_text(encoding='utf-8')
workflow = WORKFLOW.read_text(encoding='utf-8')

required_test_markers = (
    "import assert from 'node:assert/strict'",
    "import vm from 'node:vm'",
    'lead-analytics-normalization.js',
    'lead-analytics-badges-v1.js',
    'lead-analytics-summary-v1.js',
    'crm/v4/assets/v4/leads.js',
    'normalizeLeadServiceCategory',
    'normalizeLeadSourceCategory',
    'deriveLeadAnalytics',
    'leadAnalyticsSearchText',
    'function testActualLeadHaystack()',
    'function testSummaryRuntime()',
    'function testBadgeRuntime()',
    "assert.ok(haystack.includes('баннеры')",
    "assert.ok(haystack.includes('вконтакте')",
    "assert.equal(inserted, 1, 'decorating the same card twice must not duplicate badges')",
    'CRM lead analytics runtime harness passed',
)
for marker in required_test_markers:
    if marker not in test:
        errors.append(f'Missing runtime test marker: {marker}')

forbidden_test_markers = (
    'fetch(',
    'supabaseClient',
    'localStorage',
    'sessionStorage',
    'document.cookie',
    'XMLHttpRequest',
)
for marker in forbidden_test_markers:
    if marker in test:
        errors.append(f'Runtime harness must not contain network/storage marker: {marker}')

required_doc_markers = (
    'node tools/test_crm_lead_analytics_runtime.mjs',
    'actual `leadHaystack` function',
    'does not duplicate badges on a repeated render',
    'What remains manual',
    'authenticated deployed CRM',
    'No Supabase SQL is executed',
    'No Edge Function is called',
    'No Auth session is created',
    'No CRM data is loaded or modified',
)
for marker in required_doc_markers:
    if marker not in doc:
        errors.append(f'Missing runtime documentation marker: {marker}')

required_manual_markers = (
    'Automated coverage added on 2026-07-15',
    'node tools/test_crm_lead_analytics_runtime.mjs',
    'CRM_LEAD_ANALYTICS_RUNTIME_HARNESS_2026-07-15.md',
    'Remaining manual test checklist',
    'authenticated published-browser integration',
    'desktop and mobile layouts remain readable',
)
for marker in required_manual_markers:
    if marker not in manual:
        errors.append(f'Missing reduced manual-test marker: {marker}')

required_workflow_markers = (
    "- 'tools/test_crm_lead_analytics_runtime.mjs'",
    "- 'tools/check_crm_lead_analytics_runtime_harness.py'",
    "- 'docs/CRM_LEAD_ANALYTICS_RUNTIME_HARNESS_2026-07-15.md'",
    'python3 tools/check_crm_lead_analytics_runtime_harness.py',
    'node tools/test_crm_lead_analytics_runtime.mjs',
)
for marker in required_workflow_markers:
    if marker not in workflow:
        errors.append(f'Missing workflow runtime-harness marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead analytics runtime harness, reduced manual scope and no-network boundaries are valid.')
