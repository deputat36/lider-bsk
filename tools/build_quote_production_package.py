"""Build an additive, service-only package from the reviewed staging snapshot."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build():
    snapshot = json.loads((ROOT / 'supabase/staging-recovered/leader_quote_schema_20261022.json').read_text())
    tables = {}
    for item in snapshot['public_columns']:
        tables.setdefault('public.' + item['table'], []).append((item['column'], item['type'], item['default'], item['nullable']))
    for item in snapshot['columns']:
        tables.setdefault(item['table_schema'] + '.' + item['table_name'], []).append((item['column_name'], item['data_type'], item['column_default'], item['is_nullable']))
    sql = ["-- Reviewed additive package; no existing business table/role/Auth changes.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='45s';\nset local search_path=public,extensions;", "do $$ begin\n if to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then raise exception 'canonical_rbac_required'; end if;\n if to_regclass('public.leader_quote_requests') is not null or to_regprocedure('public.leader_quote_workspace_rpc(jsonb)') is not null then raise exception 'quotes_already_present_review_history'; end if;\nend $$;"]
    for table, columns in tables.items():
        assert re.fullmatch(r'(public|leader_private)\.leader_quote_[a-z_]+', table)
        definitions = []
        for name, kind, default, nullable in columns:
            assert re.fullmatch(r'[a-z_]+', name)
            definitions.append(f'  {name} {kind}' + (f' default {default}' if default else '') + (' not null' if nullable == 'NO' else ''))
        sql.append(f'create table {table} (\n' + ',\n'.join(definitions) + '\n);')
    for constraint in snapshot['constraints']:
        table = constraint['table']
        if '.' not in table:
            table = 'public.' + table
        definition = re.sub(r'REFERENCES (leader_[a-z_]+)\(', r'REFERENCES public.\1(', constraint['definition'])
        sql.append(f"alter table {table} add constraint {constraint['name']} {definition};")
    sql += [
        'create index leader_quote_requests_lead_idx on public.leader_quote_requests(lead_id,created_at desc);',
        'create index leader_quote_requests_assignee_idx on public.leader_quote_requests(assignee_id,created_at desc);',
        'create index leader_quote_requests_need_idx on public.leader_quote_requests(need_id) where need_id is not null;',
        'create index leader_quote_events_task_idx on public.leader_quote_events(task_id,created_at);',
    ]
    for table in tables:
        sql += [f'alter table {table} enable row level security;', f'revoke all on {table} from public,anon,authenticated;', f'create policy leader_quote_service_only on {table} to service_role using(true) with check(true);']
        rights = 'select,insert,update' if table.endswith(('requests', 'templates')) else 'select,insert'
        sql.append(f'grant {rights} on {table} to service_role;')
    sql.append('grant usage on schema leader_private to service_role;')
    sql.append((ROOT / 'supabase/staging-recovered/leader_quote_workspace_20261022.sql').read_text())
    sql += ["revoke all on function leader_private.leader_quote_clean_items_v1(jsonb),public.leader_quote_workspace_rpc(jsonb) from public,anon,authenticated;", "grant execute on function leader_private.leader_quote_clean_items_v1(jsonb),public.leader_quote_workspace_rpc(jsonb) to service_role;", 'commit;']
    return '\n\n'.join(sql) + '\n'


if __name__ == '__main__':
    target = ROOT / 'supabase/production-candidates/leader_quote_workspace_v1.sql'
    target.write_text(build())
    print('Prepared reviewed quote package; no server connection or deployment.')
