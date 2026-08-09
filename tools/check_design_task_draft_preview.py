from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MODEL = ROOT / "crm/v4/assets/v4/design-task-draft-model-v1.js"
PREVIEW = ROOT / "crm/v4/assets/v4/design-task-draft-preview-v1.js"
ENTRYPOINTS = ROOT / "crm/v4/assets/v4/design-task-draft-entrypoints-v1.js"
LOADER = ROOT / "crm/v4/assets/v4/site-cache-note-v1.js"
QUALITY = ROOT / "crm/v4/assets/v4/order-operational-quality-v1.js"
QUALITY_MODEL = ROOT / "crm/v4/assets/v4/order-operational-quality-model-v1.js"
QUALITY_CHECKER = ROOT / "tools/check_crm_order_operational_quality.py"
TEST = ROOT / "tools/test_design_task_draft.mjs"
MANUAL = ROOT / "docs/CRM_DESIGN_TASK_DRAFT_PREVIEW_MANUAL_TEST_2026-07-13.md"
WORKFLOW = ROOT / ".github/workflows/crm-design-task-draft-check.yml"


def read(path: Path) -> str:
    if not path.exists():
        raise AssertionError(f"missing file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require(source: str, markers: list[str], label: str) -> None:
    missing = [marker for marker in markers if marker not in source]
    if missing:
        raise AssertionError(f"{label}: missing markers: {missing}")


def forbid(source: str, markers: list[str], label: str) -> None:
    found = [marker for marker in markers if marker in source]
    if found:
        raise AssertionError(f"{label}: forbidden markers found: {found}")


def main() -> None:
    model = read(MODEL)
    preview = read(PREVIEW)
    entrypoints = read(ENTRYPOINTS)
    loader = read(LOADER)
    quality = read(QUALITY)
    quality_model = read(QUALITY_MODEL)
    quality_checker = read(QUALITY_CHECKER)
    test = read(TEST)
    manual = read(MANUAL)
    workflow = read(WORKFLOW)

    require(
        model,
        [
            "buildDesignTaskDraftPreview",
            "CRM_V4_ACTIONS.DESIGN_READ",
            "CRM_V4_ACTIONS.DESIGN_WRITE",
            "statusDefinition('design_task', 'new')",
            "allowedStatusTransitions('design_task', 'new')",
            "orderStatusUiModel",
            "design_task.create_from_order",
            "idempotency_key",
            "productionCreateEnabled: false",
            "existing_active_task",
            "design_not_proven",
            "draft_incomplete",
            "draft_ready",
            "Неизвестный статус",
        ],
        "model",
    )
    forbid(
        model,
        [
            "client_name",
            "client_phone",
            "client_total",
            "contractor_cost",
            "profit:",
            "payment",
            "expense",
            "internal_comment",
        ],
        "model safe payload",
    )

    require(
        preview,
        [
            "const ORDER_FIELDS = 'id,order_number,lead_id,project_name,status,priority,deadline,layout_status,layout_link,is_archived,updated_at'",
            "const NEED_FIELDS = 'id,lead_id,need_type,title,need_design,design_reason,deadline_date,status,completeness_score'",
            "const TASK_FIELDS = 'id,order_id,task_status,layout_status,designer_name,deadline,layout_link,created_at,updated_at'",
            "from('leader_orders')",
            "from('leader_lead_needs')",
            "from('leader_design_tasks')",
            "requireV4Action(CRM_V4_ACTIONS.DESIGN_READ)",
            "canPerformV4Action(CRM_V4_ACTIONS.DESIGN_WRITE)",
            "Создать задачу в CRM — отключено",
            "disabled title=",
            "data-design-task-draft-copy",
            "data-design-task-draft-order",
        ],
        "preview",
    )
    forbid(
        preview,
        [
            ".insert(",
            ".update(",
            ".upsert(",
            ".delete(",
            ".rpc(",
            "fetch(",
            "leader_design_task_events",
            "leader_design_task_comments",
            "leader_tasks",
            "client_name",
            "client_phone",
            "client_total",
            "contractor_cost",
            "profit",
            "payment",
            "expense",
            "internal_comment",
        ],
        "preview read-only contract",
    )

    require(
        entrypoints,
        [
            "data-design-task-draft-entrypoint",
            "Нужен дизайн, задачи нет",
            "Подготовить черновик design task",
            "Проверить дизайн-задачу",
            "#orderCardV1 [data-order-design-section]",
            "CRM_V4_ACTIONS.DESIGN_READ",
            "MutationObserver",
        ],
        "entrypoints",
    )
    forbid(
        entrypoints,
        ["supabaseClient", ".from(", ".insert(", ".update(", ".delete(", ".rpc(", "fetch("],
        "entrypoints no data access",
    )

    require(
        loader,
        [
            "import('./design-task-draft-preview-v1.js?v=20260714-design-staging-1')",
            "import('./design-task-draft-entrypoints-v1.js?v=20260714-design-staging-1')",
        ],
        "loader",
    )

    require(
        quality,
        ["designWithoutTask", "Нужен дизайн, задачи нет", "leader_design_tasks"],
        "existing quality queue",
    )
    require(
        quality_model,
        ["designWithoutTask", "need_design === true", "designTaskOrderIds"],
        "existing quality model",
    )
    require(
        quality_checker,
        [
            "check_design_task_draft_preview.py",
            "CRM design task draft checker is included in the order full-audit path.",
        ],
        "transitive full-audit integration",
    )

    require(
        test,
        [
            "Design task draft preview model behavior is valid.",
            "existing_active_task",
            "Особый статус дизайнера",
            "productionCreateEnabled",
            "client_total",
            "contractor_cost",
            "client_phone",
            "design_not_proven",
            "order_unavailable",
        ],
        "behavior test",
    )

    require(
        manual,
        [
            "локальный preview черновика дизайн-задачи",
            "`leader_design_tasks` — 0 строк",
            "Создать задачу в CRM — отключено",
            "Network checklist",
            "design_task.create_from_order",
            "Approval gates",
            "Не создавать production-строку ради теста.",
        ],
        "manual test",
    )

    require(
        workflow,
        [
            "CRM design task draft check",
            "python3 tools/check_design_task_draft_preview.py",
            "node tools/test_design_task_draft.mjs",
            "node --check crm/v4/assets/v4/design-task-draft-model-v1.js",
            "node --check crm/v4/assets/v4/design-task-draft-preview-v1.js",
            "node --check crm/v4/assets/v4/design-task-draft-entrypoints-v1.js",
        ],
        "workflow",
    )

    print("CRM design task draft preview is canonical, minimized and protected from production writes.")


if __name__ == "__main__":
    main()
