#!/usr/bin/env python3
"""Regression contract: one CRM v4 router owns global tab navigation (#478)."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "crm/v4/assets/v4"
ROUTER = ASSETS / "crm-v4-tabs-lite.js"
LOADER = ASSETS / "crm-v4-tab-loader-v1.js"
SITE_CACHE = ASSETS / "site-cache-note-v1.js"

PRIMARY_TAB_MODULES = (
    "management-dashboard-v3.js",
    "orders-fast-loader-v1.js",
    "order-control-v2.js",
    "finance-control-v2.js",
    "production-board-v3.js",
    "contact-control-v1.js",
    "public-lead-audit-v1.js",
    "user-admin-v1.js",
)

HIDDEN_TAB_IMPORTS = (
    "public-lead-audit-v1.js",
    "management-workload-panel-v1.js",
    "lead-attribution-funnel-panel-v1.js",
    "finance-plan-actual-panel-v1.js",
)


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise AssertionError(f"{source.relative_to(ROOT)}: missing marker: {marker}")


def main() -> int:
    router = ROUTER.read_text(encoding="utf-8")
    loader = LOADER.read_text(encoding="utf-8")
    site_cache = SITE_CACHE.read_text(encoding="utf-8")

    for marker in (
        "event.target.closest?.('[data-v4-tab-button]')",
        "document.body.dataset.v4Tab = activeTab",
        "syncTabUrl(activeTab",
        "window.addEventListener('popstate'",
        "leader-v4:tab-opened",
    ):
        require(router, marker, ROUTER)

    for filename in PRIMARY_TAB_MODULES:
        path = ASSETS / filename
        text = path.read_text(encoding="utf-8")
        for marker in ("export { mount }", "export function refresh()"):
            require(text, marker, path)
        if "export function load()" not in text and "export { load }" not in text:
            raise AssertionError(f"{path.relative_to(ROOT)}: missing load export")
        forbidden = {
            "main-menu selector": "data-v4-tab-button",
            "global tab event": "leader-v4:tab-opened",
            "global tab assignment": "document.body.dataset.v4Tab =",
            "capture navigation stop": "stopImmediatePropagation()",
            "navigation stop": "stopPropagation()",
        }
        for label, marker in forbidden.items():
            if marker in text:
                raise AssertionError(f"{path.relative_to(ROOT)}: {label} must belong to central router: {marker}")

    if len(re.findall(r"dispatchEvent\(new CustomEvent\('leader-v4:tab-opened'", router)) != 1:
        raise AssertionError("central router must emit exactly one canonical tab-opened event")
    for path in ASSETS.glob("*.js"):
        if path == ROUTER:
            continue
        text = path.read_text(encoding="utf-8")
        if "dispatchEvent(new CustomEvent('leader-v4:tab-opened'" in text:
            raise AssertionError(f"{path.relative_to(ROOT)}: duplicate tab-opened emitter")

    for marker in (
        "await modules[0].load?.()",
        "await (modules[0].refresh || modules[0].load)?.()",
        "modules[5].bootCalculations?.()",
        "modules[6].bootCalculationDraftReview?.()",
        "modules[8].bootOffers?.()",
        "modules[9].bootOrders?.()",
        "import('./orders.js?v=",
    ):
        require(loader, marker, LOADER)

    for filename in HIDDEN_TAB_IMPORTS:
        executable_lines = [line for line in site_cache.splitlines() if not line.lstrip().startswith("//")]
        if any(filename in line for line in executable_lines):
            raise AssertionError(f"{SITE_CACHE.relative_to(ROOT)}: hidden tab module must not boot from lead card: {filename}")

    print("CRM single tab router contract: OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"CRM single tab router contract: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
