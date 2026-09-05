#!/usr/bin/env python3
"""Guard read-only rollout probes and the known missing-prerequisite regression."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PROBES = ['PREFLIGHT', 'POSTFLIGHT']

def validate(sql, phase):
    errors = []
    # Remove comments and quoted literals before inspecting executable tokens.
    code = re.sub(r"--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'", ' ', sql, flags=re.S)
    statements = [s.strip() for s in code.split(';') if s.strip()]
    if not statements or statements[0].upper() != 'BEGIN TRANSACTION READ ONLY':
        errors.append('missing read-only transaction')
    if not statements or statements[-1].upper() != 'ROLLBACK':
        errors.append('missing rollback')
    for stmt in statements[1:-1]:
        if not re.match(r'^SELECT\b', stmt, re.I):
            errors.append('only SELECT probes allowed')
    if re.search(r'\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|COPY|TRUNCATE|EXECUTE|SET|INTO)\b', code, re.I):
        errors.append('mutation or dynamic execution forbidden')
    if phase == 'PREFLIGHT' and re.search(r'\b(FROM|JOIN)\s+leader_private\.', code, re.I):
        errors.append('preflight cannot reference optional private relations in FROM/JOIN')
    if phase == 'PREFLIGHT':
        for key in ['catalog_required_columns', 'price_log_required_columns', 'rbac_receipts_prerequisite_ready', 'staging_guard_absent']:
            if "'" + key + "'" not in sql:
                errors.append('missing gate: ' + key)
    else:
        for key in ['business_rpc_security_invoker', 'private_helper_security_definer', 'manager_manage', 'service_receipt_table_delete', 'relrowsecurity', "has_function_privilege('anon'"]:
            if key not in sql:
                errors.append('missing security observation: ' + key)
    return errors

def main():
    errors = []
    for phase in PROBES:
        sql = (ROOT / f'docs/{phase}_CATALOG_PRODUCTION_ROLLOUT_2026-09-04.sql').read_text()
        errors.extend(f'{phase}: {e}' for e in validate(sql, phase))
        # Negative regressions: mutations and the original parse-time crash must be rejected.
        if not validate(sql.replace('ROLLBACK;', 'DELETE FROM public.leader_catalog; ROLLBACK;'), phase):
            errors.append('checker accepted mutation')
        if not validate(sql.replace('BEGIN TRANSACTION READ ONLY;', 'BEGIN;'), phase):
            errors.append('checker accepted writable transaction')
        if phase == 'PREFLIGHT' and not validate(sql.replace('ROLLBACK;', "SELECT * FROM leader_private.leader_role_action_matrix_v1 WHERE to_regclass('leader_private.leader_role_action_matrix_v1') IS NOT NULL; ROLLBACK;"), phase):
            errors.append('checker accepted missing-relation regression')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print('Catalog rollout probes: read-only boundary and missing-prerequisite regression PASS')
    return 0

if __name__ == '__main__':
    sys.exit(main())
