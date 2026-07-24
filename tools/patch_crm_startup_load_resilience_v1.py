#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "crm/v4/assets/v4/management-dashboard-v3.js"
LEADS = ROOT / "crm/v4/assets/v4/leads.js"

DASHBOARD_IMPORT_OLD = "import { friendlyError } from './api.js';"
DASHBOARD_IMPORT_NEW = "import { timeout, friendlyError } from './api.js';"

DASHBOARD_FIELDS_OLD = "const OFFER_FIELDS = 'id,lead_id,calculation_id,title,status,total_sum,valid_until,order_id,created_at';\n"
DASHBOARD_FIELDS_NEW = DASHBOARD_FIELDS_OLD + "const DASHBOARD_SOURCE_TIMEOUT_MS = 12000;\n"

DASHBOARD_QUERY_OLD = """async function safeQuery(label, query) {
  try { const response = await query; if (response.error) throw response.error; return response.data || []; }
  catch (error) { sourceErrors.push(`${label} — ${friendlyError(error)}`); return []; }
}
"""
DASHBOARD_QUERY_NEW = """async function safeQuery(label, query) {
  try {
    const response = await timeout(
      query,
      DASHBOARD_SOURCE_TIMEOUT_MS,
      `${label} не ответил за ${Math.round(DASHBOARD_SOURCE_TIMEOUT_MS / 1000)} секунд`
    );
    if (response.error) throw response.error;
    return response.data || [];
  } catch (error) {
    sourceErrors.push(`${label} — ${friendlyError(error)}`);
    return [];
  }
}
"""

LEADS_EMPTY_OLD = "Заявки загрузятся автоматически после входа. Также можно нажать «Обновить заявки»."
LEADS_EMPTY_NEW = "Заявки загрузятся при открытии раздела. Также можно нажать «Обновить заявки»."

LEADS_BOOT_OLD = """  document.addEventListener('leader-v4:crm-ready', () => loadLeads({ silent: true, force: true }));
"""
LEADS_BOOT_NEW = """  const loadVisibleLeads = () => {
    if (document.body?.dataset?.v4Tab !== 'leads') {
      renderLeads();
      return;
    }
    if (v4State.leadsLoaded) {
      renderLeads();
      return;
    }
    loadLeads({ silent: true });
  };
  document.addEventListener('leader-v4:crm-ready', loadVisibleLeads);
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'leads') loadVisibleLeads();
  });
"""


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count == 1:
        return content.replace(old, new, 1)
    if count == 0 and new in content:
        return content
    raise RuntimeError(f"{label}: expected exactly one source fragment, found {count}")


def apply_patch() -> None:
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    dashboard = replace_once(dashboard, DASHBOARD_IMPORT_OLD, DASHBOARD_IMPORT_NEW, "dashboard import")
    dashboard = replace_once(dashboard, DASHBOARD_FIELDS_OLD, DASHBOARD_FIELDS_NEW, "dashboard timeout constant")
    dashboard = replace_once(dashboard, DASHBOARD_QUERY_OLD, DASHBOARD_QUERY_NEW, "dashboard safeQuery")
    DASHBOARD.write_text(dashboard, encoding="utf-8")

    leads = LEADS.read_text(encoding="utf-8")
    leads = replace_once(leads, LEADS_EMPTY_OLD, LEADS_EMPTY_NEW, "leads empty state")
    leads = replace_once(leads, LEADS_BOOT_OLD, LEADS_BOOT_NEW, "leads boot gate")
    LEADS.write_text(leads, encoding="utf-8")


def check_patch() -> None:
    dashboard = DASHBOARD.read_text(encoding="utf-8")
    leads = LEADS.read_text(encoding="utf-8")

    required_dashboard = [
        DASHBOARD_IMPORT_NEW,
        "const DASHBOARD_SOURCE_TIMEOUT_MS = 12000;",
        "const response = await timeout(",
        "`${label} не ответил за ${Math.round(DASHBOARD_SOURCE_TIMEOUT_MS / 1000)} секунд`",
        "sourceErrors.push(`${label} — ${friendlyError(error)}`)",
        "const [leads, needs, calculations, orders, production, installation, offers] = await Promise.all([",
    ]
    required_leads = [
        LEADS_EMPTY_NEW,
        "const loadVisibleLeads = () => {",
        "document.body?.dataset?.v4Tab !== 'leads'",
        "if (v4State.leadsLoaded)",
        "document.addEventListener('leader-v4:crm-ready', loadVisibleLeads);",
        "document.addEventListener('leader-v4:tab-opened'",
        "if (event.detail?.tab === 'leads') loadVisibleLeads();",
        "byId('reloadLeadsBtn')?.addEventListener('click', () => loadLeads({ force: true }));",
    ]

    missing = [f"dashboard missing: {fragment}" for fragment in required_dashboard if fragment not in dashboard]
    missing += [f"leads missing: {fragment}" for fragment in required_leads if fragment not in leads]

    forbidden = [
        DASHBOARD_IMPORT_OLD,
        DASHBOARD_QUERY_OLD,
        LEADS_EMPTY_OLD,
        LEADS_BOOT_OLD,
    ]
    present_forbidden = [fragment for fragment in forbidden if fragment in dashboard or fragment in leads]
    missing += [f"obsolete startup fragment remains: {fragment[:80]}" for fragment in present_forbidden]

    if missing:
        raise RuntimeError("\n".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.apply == args.check:
        raise SystemExit("choose exactly one of --apply or --check")
    if args.apply:
        apply_patch()
        check_patch()
        print("crm startup load resilience patch applied")
    else:
        check_patch()
        print("crm startup load resilience: ok")


if __name__ == "__main__":
    main()
