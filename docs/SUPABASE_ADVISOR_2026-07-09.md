# Supabase Advisor audit

2026-07-09

Checked read-only:
- project is active;
- Security Advisor reviewed;
- Performance Advisor reviewed;
- no production changes.

Result:
- no changes were made to `leader_*` objects;
- security warnings are outside the public RA Lider site scope: `nav_*`, `broker_*` and Auth settings;
- performance warnings include mixed scopes, including `leader_*`, but were not applied because index/RLS tuning requires separate workload analysis;
- public form and `leader-public-lead` were not changed.
