-- Leader-only public intake configuration; no keys or customer rows are exported.
begin;
create table if not exists leader_private.leader_public_intake_config (
 id boolean primary key default true check(id),
 salt text not null default encode(extensions.gen_random_bytes(32),'hex') check(length(salt)>=32)
);
insert into leader_private.leader_public_intake_config(id) values(true) on conflict do nothing;
alter table leader_private.leader_public_intake_config enable row level security;
revoke all on leader_private.leader_public_intake_config from public,anon,authenticated;
grant select on leader_private.leader_public_intake_config to service_role;
create or replace function public.leader_public_intake_config_rpc() returns jsonb
language sql security definer set search_path=pg_catalog,leader_private
as $$ select jsonb_build_object('salt',salt) from leader_private.leader_public_intake_config where id $$;
revoke all on function public.leader_public_intake_config_rpc() from public,anon,authenticated;
grant execute on function public.leader_public_intake_config_rpc() to service_role;
commit;

