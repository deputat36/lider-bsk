#!/usr/bin/env python3
"""Source contract for CRM v4 lazy tab startup (#478)."""

from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "crm/v4/index.html"
LOADER = ROOT / "crm/v4/assets/v4/crm-v4-tab-loader-v1.js"
AUTH = ROOT / "crm/v4/assets/v4/auth.js"
BADGES = ROOT / "crm/v4/assets/v4/lead-analytics-badges-v1.js"
LEAD_CARD = ROOT / "crm/v4/assets/v4/lead-card.js"

HEAVY_EAGER = {
    "management-dashboard-v3.js",
    "contact-control-v1.js",
    "catalog-management-v1.js",
    "lead-card.js",
    "needs.js",
    "calculations.js",
    "offers.js",
    "orders.js",
    "orders-fast-loader-v1.js",
    "order-control-v2.js",
    "finance-control-v2.js",
    "production-board-v3.js",
    "production-alerts-v1.js",
    "production-job-card-v2.js",
    "installation-job-card-v2.js",
    "installation-job-card-v3.js",
    "public-lead-audit-v1.js",
    "user-admin-v1.js",
    "site-cache-note-v1.js",
}

TABS = (
    "management_dashboard",
    "orders",
    "order_control",
    "finance_control",
    "production",
    "contact_control",
    "catalog",
    "public_lead_audit",
    "user_admin",
)


class ModuleScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "script" and values.get("type") == "module" and values.get("src"):
            self.sources.append(str(values["src"]))


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise AssertionError(f"{source.relative_to(ROOT)}: missing marker: {marker}")


def main() -> int:
    index = INDEX.read_text(encoding="utf-8")
    loader = LOADER.read_text(encoding="utf-8")
    auth = AUTH.read_text(encoding="utf-8")
    badges = BADGES.read_text(encoding="utf-8")
    lead_card = LEAD_CARD.read_text(encoding="utf-8")

    parser = ModuleScriptParser()
    parser.feed(index)
    if len(parser.sources) > 11:
        raise AssertionError(f"too many eager module entrypoints: {len(parser.sources)} > 11")
    for source in parser.sources:
        if any(name in source for name in HEAVY_EAGER):
            raise AssertionError(f"heavy module remains eager: {source}")

    for path in (ROOT / "crm/v4/assets/v4").glob("*.js"):
        if path == LOADER:
            continue
        text = path.read_text(encoding="utf-8")
        if "installation-job-card-v2.js" in text or "installation-job-card-v3.js" in text:
            raise AssertionError(
                f"installation card may only be referenced by crm-v4-tab-loader-v1.js: {path.relative_to(ROOT)}"
            )

    require(index, "crm-v4-tab-loader-v1.js?v=20260816-direct-card-1", INDEX)
    for tab in TABS:
        require(loader, f"{tab}: Object.freeze({{", LOADER)
        require(loader, f"requiredPermission: '{tab}'", LOADER)
    for marker in (
        "const modulePromises = new Map()",
        "const loadPromises = new Map()",
        "modulePromises.has(tab)",
        "loadPromises.has(tab)",
        "data-v4-tab-retry",
        "showLoading(tab",
        "showError(tab",
        "canOpenV4Tab(config.requiredPermission)",
        "leader-v4:tab-section-ready",
        "const currentTab = String(document.body?.dataset?.v4Tab || '')",
        "if (currentTab === 'card') loadLeadCardBundle()",
        "import('./lead-card.js?v=20260816-direct-card-1')",
    ):
        require(loader, marker, LOADER)

    if "user-admin-v1.js" in auth:
        raise AssertionError("auth.js must not eager-import user admin")
    for forbidden in (
        "import './lead-operational-quality-v1.js",
        "import './lead-attribution-funnel-panel-v1.js",
        "import './lead-work-quick-filters-ui-v1.js",
    ):
        if forbidden in badges:
            raise AssertionError(f"lead analytics boot must not start background heavy module: {forbidden}")
    if "import './lead-work-quick-filters-ui-v1.js" in badges:
        raise AssertionError("lead quick filters must not use a static eager import")
    require(badges, "import('./lead-work-quick-filters-ui-v1.js?v=20260723-1')", BADGES)
    require(badges, "import('./lead-operational-quality-v1.js?v=20260718-deferred-1')", BADGES)
    require(badges, "import('./lead-attribution-funnel-panel-v1.js?v=20260718-deferred-1')", BADGES)
    require(badges, "button.addEventListener('click', async () =>", BADGES)
    require(lead_card, "const routedLeadId = v4State.route.leadId || readCrmLeadRoute(window.location.href)", LEAD_CARD)
    require(lead_card, "setRoute({ leadId: routedLeadId })", LEAD_CARD)
    require(lead_card, "leader-v4:route-change", LEAD_CARD)

    print(f"CRM lazy tab loader contract: OK ({len(parser.sources)} eager entrypoints)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"CRM lazy tab loader contract: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
