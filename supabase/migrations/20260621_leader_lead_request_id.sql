-- РА Лидер: усиление публичных заявок сайта.
-- Применено в Supabase 2026-06-21.
-- Изменение добавочное: данные, политики и таблицы других проектов не удаляются.

begin;

alter table public.leader_leads
  add column if not exists request_id text,
  add column if not exists phone_normalized text,
  add column if not exists source_page_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists client_user_agent text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leader_leads'::regclass
      and conname = 'leader_leads_request_id_key'
  ) then
    alter table public.leader_leads
      add constraint leader_leads_request_id_key unique (request_id);
  end if;
end $$;

create index if not exists ix_leader_leads_phone_normalized_created_at
  on public.leader_leads (phone_normalized, created_at desc)
  where phone_normalized is not null;

commit;
