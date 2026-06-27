# Supabase advisor status — 2026-06-27

Scope: RA Lider contour in Supabase project `ofewxuqfjhamgerwzull`.

This file is a read-only status snapshot. No Supabase production objects were changed during this check.

## Edge Functions

Active RA Lider functions:

- `leader-public-lead v9`, `verify_jwt=false` — public lead form endpoint.
- `leader-crm-leads v12`, `verify_jwt=true` — CRM leads endpoint.
- `leader-crm-orders v2`, `verify_jwt=true` — CRM orders endpoint.

Other active functions such as `nav-*` and `parket-*` belong to other contours and must not be changed as part of RA Lider CRM hardening.

## SECURITY DEFINER advisor scope

Targeted query result for callable `public` SECURITY DEFINER functions by scope:

| Scope | Role | Callable functions |
| --- | --- | ---: |
| `nav` | `authenticated` | 42 |

There were no callable `public.leader_%` SECURITY DEFINER functions for `anon`, `authenticated`, or `public` in this check.

Interpretation:

- Supabase Security Advisor warnings for callable SECURITY DEFINER functions are still present for the `nav_*` contour.
- RA Lider `leader_*` functions remain outside that exposed advisor finding.
- `nav_*` remediation is out of scope for the RA Lider CRM-access task unless explicitly requested.

## CRM access tables

Targeted access-table check:

| Table | RLS | Exposed grants |
| --- | --- | --- |
| `leader_user_invites` | enabled | `authenticated:SELECT`, `authenticated:INSERT`, `authenticated:UPDATE` |
| `leader_user_profiles` | enabled | `authenticated:SELECT`, `authenticated:INSERT`, `authenticated:UPDATE` |

No `anon` grants were present for these CRM access tables in this check.

## Active CRM users

Current active profile counts:

| Role | Active users |
| --- | ---: |
| `owner` | 2 |
| `admin` | 1 |
| `manager` | 1 |

No inactive/pending profiles were present in the grouped result at the time of this snapshot.

## Known Supabase advisor baseline

Security Advisor may still report:

- callable SECURITY DEFINER warnings for `nav_*` / `nav_v2_*` functions;
- leaked password protection not enabled.

These findings are recorded as baseline/out-of-scope for the current RA Lider CRM hardening pass. Do not treat them as fixed by the RA Lider migrations.
