-- Staging-only compatibility migration for CRM need duplicate dependency preflight.
-- Never apply this file to production: production already has is_current_revision.

alter table public.leader_lead_calculations
  add column if not exists is_current_revision boolean not null default true;
