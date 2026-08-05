#!/usr/bin/env python3
"""Source contract for CRM v4 navigation stabilization (#478)."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
TABS = ROOT / "crm/v4/assets/v4/crm-v4-tabs-lite.js"
MENU = ROOT / "crm/v4/assets/v4/crm-v4-expanded-menu-v1.js"


def require(text: str, marker: str, source: str) -> None:
    if marker not in text:
        raise AssertionError(f"{source}: missing marker: {marker}")


def forbid(text: str, marker: str, source: str) -> None:
    if marker in text:
        raise AssertionError(f"{source}: forbidden marker remains: {marker}")


def main() -> int:
    tabs = TABS.read_text(encoding="utf-8")
    menu = MENU.read_text(encoding="utf-8")

    require(tabs, "if (canOpenV4Tab('leads')) return 'leads';", str(TABS))
    require(tabs, "DUPLICATE_TRANSITION_WINDOW_MS", str(TABS))
    require(tabs, "duplicateTransition(activeTab", str(TABS))
    require(tabs, "TAB_RENDER_TIMEOUT_MS", str(TABS))
    require(tabs, "data-v4-tab-retry", str(TABS))
    require(tabs, "Раздел не загрузился", str(TABS))
    require(tabs, "aria-busy", str(TABS))

    require(menu, "let menuBuilt = false;", str(MENU))
    require(menu, "requestAnimationFrame", str(MENU))
    require(menu, "function buildMenuOnce", str(MENU))
    require(menu, "if (!menuBuilt) buildMenuOnce(nav);", str(MENU))
    forbid(menu, "window.setTimeout(syncExpandedMenu, 350)", str(MENU))
    forbid(menu, "window.setTimeout(syncExpandedMenu, 1200)", str(MENU))

    print("CRM navigation stability contract: OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"CRM navigation stability contract: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
