#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / 'assets' / 'public-lead-form.js'
HELPER = ROOT / 'assets' / 'public-lead-reference-v1.js'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0 and new in text:
        return text
    if count != 1:
        raise RuntimeError(f'{label}: expected one source marker, found {count}')
    return text.replace(old, new, 1)


def patch_form(text: str) -> str:
    if "const PENDING_STORAGE_KEY='leader_public_lead_pending_v1'" not in text:
        text = replace_once(
            text,
            "  const METRIKA_ID=109387236;\n",
            "  const METRIKA_ID=109387236;\n"
            "  const PENDING_STORAGE_KEY='leader_public_lead_pending_v1';\n"
            "  const MAX_PENDING_AGE_MS=30*60*1000;\n",
            'form constants',
        )
    if 'function stableRequestId(payload)' not in text:
        text = replace_once(
            text,
            "  function requestId(){return 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}\n"
            "  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(s){s.className='leader-lead-status show '+type;s.textContent=msg}}\n",
            "  function requestId(){return 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}\n"
            "  function normalizePhone(value){return clean(value).replace(/\\D+/g,'')}\n"
            "  function fingerprint(payload){\n"
            "    const source=[normalizePhone(payload.phone),clean(payload.service).toLowerCase(),clean(payload.page_path).toLowerCase(),clean(payload.message)].join('|');\n"
            "    let hash=2166136261;\n"
            "    for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}\n"
            "    return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');\n"
            "  }\n"
            "  function readPending(){\n"
            "    try{\n"
            "      const value=JSON.parse(window.sessionStorage.getItem(PENDING_STORAGE_KEY)||'null');\n"
            "      if(!value||!value.request_id||!value.fingerprint)return null;\n"
            "      if(Date.now()-Number(value.created_at||0)>MAX_PENDING_AGE_MS){window.sessionStorage.removeItem(PENDING_STORAGE_KEY);return null}\n"
            "      return value;\n"
            "    }catch(_){return null}\n"
            "  }\n"
            "  function writePending(value){try{window.sessionStorage.setItem(PENDING_STORAGE_KEY,JSON.stringify(value))}catch(_){}}\n"
            "  function clearPending(){try{window.sessionStorage.removeItem(PENDING_STORAGE_KEY)}catch(_){}}\n"
            "  function stableRequestId(payload){\n"
            "    const currentFingerprint=fingerprint(payload);\n"
            "    const pending=readPending();\n"
            "    if(pending&&pending.fingerprint===currentFingerprint)return pending.request_id;\n"
            "    const id=requestId();\n"
            "    writePending({request_id:id,fingerprint:currentFingerprint,created_at:Date.now()});\n"
            "    return id;\n"
            "  }\n"
            "  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(s){s.className='leader-lead-status show '+type;s.textContent=msg}}\n",
            'form retry helpers',
        )
    text = replace_once(
        text,
        "  function normalizePhone(value){return clean(value).replace(/\\D+/g,'')}\n",
        "  function normalizePhone(value){const digits=clean(value).replace(/\\D+/g,'');return digits.length>=11?digits.slice(-10):digits}\n",
        'form phone normalization',
    )
    text = replace_once(
        text,
        "    const pageTitle=(document.title||'').replace(/\\s+/g,' ').trim();\n"
        "    const rid=requestId();\n"
        "    const submittedAt=new Date().toISOString();\n",
        "    const pageTitle=(document.title||'').replace(/\\s+/g,' ').trim();\n"
        "    const submittedAt=new Date().toISOString();\n",
        'form request id timing',
    )
    text = replace_once(
        text,
        "    const payload={\n"
        "      request_id:rid,\n",
        "    const payload={\n",
        'form payload request id',
    )
    text = replace_once(
        text,
        "      website:field(form,'website')\n"
        "    };\n\n"
        "    form.dataset.submitting='1';\n",
        "      website:field(form,'website')\n"
        "    };\n"
        "    const rid=stableRequestId(payload);\n"
        "    payload.request_id=rid;\n\n"
        "    form.dataset.submitting='1';\n",
        'form stable request id',
    )
    text = replace_once(
        text,
        "      const responseRequestId=clean(data.request_id)||rid;\n"
        "      if(!res.ok)throw new Error('Ошибка '+res.status);\n",
        "      const responseRequestId=clean(data.request_id)||rid;\n"
        "      if(!res.ok||data.ok!==true)throw new Error('Ошибка '+res.status);\n"
        "      clearPending();\n",
        'form confirmed success',
    )
    return text


def patch_helper(text: str) -> str:
    if "return 'fnv1a-'" not in text:
        text = replace_once(
            text,
            "  function fingerprint(payload){\n"
            "    return [\n"
            "      normalizePhone(payload.phone),\n"
            "      clean(payload.service).toLowerCase(),\n"
            "      clean(payload.page_path).toLowerCase(),\n"
            "      clean(payload.message)\n"
            "    ].join('|');\n"
            "  }\n",
            "  function fingerprint(payload){\n"
            "    const source=[normalizePhone(payload.phone),clean(payload.service).toLowerCase(),clean(payload.page_path).toLowerCase(),clean(payload.message)].join('|');\n"
            "    let hash=2166136261;\n"
            "    for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}\n"
            "    return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');\n"
            "  }\n",
            'helper fingerprint',
        )
    text = replace_once(
        text,
        "  function normalizePhone(value){return clean(value).replace(/\\D+/g,'')}\n",
        "  function normalizePhone(value){const digits=clean(value).replace(/\\D+/g,'');return digits.length>=11?digits.slice(-10):digits}\n",
        'helper phone normalization',
    )
    return text


def main() -> int:
    form = FORM.read_text(encoding='utf-8')
    helper = HELPER.read_text(encoding='utf-8')
    updated_form = patch_form(form)
    updated_helper = patch_helper(helper)

    changed = False
    if updated_form != form:
        FORM.write_text(updated_form, encoding='utf-8')
        changed = True
    if updated_helper != helper:
        HELPER.write_text(updated_helper, encoding='utf-8')
        changed = True

    print('changed' if changed else 'already-applied')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
