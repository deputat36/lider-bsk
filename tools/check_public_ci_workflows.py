from pathlib import Path


MAIN_WORKFLOW = Path('.github/workflows/public-site-audit-check.yml')
SECRET_WORKFLOW = Path('.github/workflows/public-no-secret-markers-check.yml')


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f"Missing {marker!r} in {source}")


def main() -> None:
    for source in (MAIN_WORKFLOW, SECRET_WORKFLOW):
        if not source.is_file():
            raise SystemExit(f"Missing workflow: {source}")

    main_text = MAIN_WORKFLOW.read_text(encoding='utf-8')
    secret_text = SECRET_WORKFLOW.read_text(encoding='utf-8')

    require(main_text, 'workflow_dispatch:', MAIN_WORKFLOW)
    require(secret_text, 'workflow_dispatch:', SECRET_WORKFLOW)

    require(main_text, '.github/workflows/public-no-secret-markers-check.yml', MAIN_WORKFLOW)
    require(main_text, 'tools/check_public_ci_workflows.py', MAIN_WORKFLOW)

    for marker in (
        "'*.html'",
        "'assets/**/*.js'",
        "'assets/**/*.css'",
        'shopt -s nullglob globstar',
        'SUPABASE_SERVICE_ROLE',
        'SUPABASE_SERVICE_KEY',
        'PRIVATE_KEY',
    ):
        require(secret_text, marker, SECRET_WORKFLOW)

    print('Public CI workflow contracts are valid.')


if __name__ == '__main__':
    main()
