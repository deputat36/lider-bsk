#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OFFERS = ROOT / 'crm/v4/assets/v4/offers.js'
INDEX = ROOT / 'crm/v4/index.html'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


offers = OFFERS.read_text(encoding='utf-8')
offers = replace_once(
    offers,
    "  const defaultTitle = calculation ? `КП: ${calculation.title || 'Расчёт'}` : '';\n  return `<div id=\"offerCreateForm\" class=\"v4-offer-form\">",
    "  const defaultTitle = calculation ? `КП: ${calculation.title || 'Расчёт'}` : '';\n  const lead = v4State.currentLead || {};\n  const hasClientIdentity = Boolean(String(lead.name || '').trim() || String(lead.phone || '').trim());\n  return `<div id=\"offerCreateForm\" class=\"v4-offer-form\">",
    'client identity availability'
)
offers = replace_once(
    offers,
    '''          <input id="offerIncludeClientDetails" type="checkbox">\n          <span><b>Показывать имя и контакты клиента в КП</b><small>По умолчанию выключено. Если включить, в КП попадут сохранённые имя и телефон из заявки.</small></span>''',
    '''          <input id="offerIncludeClientDetails" type="checkbox" ${hasClientIdentity ? '' : 'disabled'}>\n          <span><b>Показывать имя и контакты клиента в КП</b><small>${hasClientIdentity ? 'По умолчанию выключено. Если включить, в КП попадут сохранённые имя и телефон из заявки.' : 'В заявке не заполнены имя и телефон — сначала добавьте хотя бы одно из этих полей.'}</small></span>''',
    'privacy toggle availability'
)
OFFERS.write_text(offers, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
index = replace_once(
    index,
    'assets/v4/offers.css?v=20260717-next-action-1',
    'assets/v4/offers.css?v=20260907-client-privacy-1',
    'offers css cache key'
)
INDEX.write_text(index, encoding='utf-8')

print('issue 516 offer privacy UX finalizer applied')
