#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
AUDIT_UI = ROOT / 'crm/v4/assets/v4/public-lead-audit-v1.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'
SOURCE_CONTRACT = ROOT / 'tools/check_public_lead_audit_contract.py'

REASON_LABELS = {
    'lead_insert_created': 'Новая заявка создана',
    'request_id_conflict': 'Повторная отправка с тем же номером обращения',
    'honeypot_filled': 'Заполнено скрытое антиспам-поле',
    'phone_or_message_required': 'Не указан телефон и текст заявки',
    'insert_failed': 'Не удалось записать заявку',
}

CACHE_IMPORT = "import('./public-lead-audit-v1.js?v=20260805-tab-loader-1')"


def read_required(path: Path, label: str, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f'{label} is missing')
        return ''
    return path.read_text(encoding='utf-8')


def main() -> None:
    errors: list[str] = []
    ui = read_required(AUDIT_UI, 'CRM public lead audit module', errors)
    loader = read_required(LOADER, 'CRM site cache loader', errors)
    contract = read_required(SOURCE_CONTRACT, 'Public lead audit source-contract checker', errors)

    if ui:
        for marker in (
            'function reasonRu(value)',
            'reasonRu(row.reason)',
            "const reasonCode = row.reason || '';",
            'const reasonLabel = reasonRu(reasonCode);',
            'код: ${reasonCode}',
            'Причина: ${esc(reasonText)}',
            "return map[value] || value || '—';",
        ):
            if marker not in ui:
                errors.append(f'Audit UI missing reason-label marker: {marker}')

        for reason, label in REASON_LABELS.items():
            marker = f"{reason}: '{label}'"
            if marker not in ui:
                errors.append(f'Audit UI missing label mapping: {reason} -> {label}')

    if loader and CACHE_IMPORT not in loader:
        errors.append(f'CRM loader missing current audit cache import: {CACHE_IMPORT}')

    if contract:
        for reason in REASON_LABELS:
            if f"'{reason}'" not in contract:
                errors.append(f'Source-contract checker missing reason code: {reason}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(f'Public lead audit reason labels are valid for {len(REASON_LABELS)} outcomes.')


if __name__ == '__main__':
    main()
