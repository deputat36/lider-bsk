# Supabase SECURITY DEFINER baseline — 2026-06-28

Project: `ofewxuqfjhamgerwzull`.

This document is a read-only snapshot of the current production Supabase state. It does not represent a schema change, migration, grant change, policy change, data change, or Edge Function deployment.

## Read-only query

The baseline was observed with this read-only query:

```sql
select count(*) filter (where p.prosecdef and n.nspname = 'public') as security_definer_public,
       count(*) filter (where p.prosecdef and n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) as executable_by_authenticated,
       count(*) filter (where p.prosecdef and n.nspname = 'public' and not has_function_privilege('authenticated', p.oid, 'execute')) as not_executable_by_authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace;
```

Observed result on 2026-06-28:

| Metric | Count |
| --- | ---: |
| `security_definer_public` | 70 |
| `executable_by_authenticated` | 46 |
| `not_executable_by_authenticated` | 24 |

## Interpretation

This is a project-wide baseline for `public` SECURITY DEFINER functions, not a RA Lider CRM-only result.

The baseline overlaps with known Navigator `nav_*` / `nav_v2_*` advisor scope documented elsewhere. It must not be interpreted as a fixed finding.

RA Lider CRM hardening remains scoped to `leader_*` objects unless a separate reviewed task explicitly changes Navigator objects.

## Related Supabase state

Observed through the Supabase connector on 2026-06-28:

- project status: `ACTIVE_HEALTHY`;
- database host: `db.ofewxuqfjhamgerwzull.supabase.co`;
- database engine: PostgreSQL `17`;
- `leader-public-lead v9`: `verify_jwt=false`;
- `leader-crm-leads v12`: `verify_jwt=true`;
- `leader-crm-orders v2`: `verify_jwt=true`;
- `nav-invite-user v8`: `verify_jwt=true`;
- `nav-v2-deal-api v2`: `verify_jwt=true`;
- `parket-public-lead v1`: `verify_jwt=false`;
- Edge Function logs returned no entries in the connector result.

## Explicit non-changes

No Supabase production objects were changed while recording this baseline:

- no DDL;
- no migration;
- no RLS policy change;
- no grant change;
- no data update;
- no Edge Function deploy.
