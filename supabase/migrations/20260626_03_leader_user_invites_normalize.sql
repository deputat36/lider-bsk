create or replace function public.leader_normalize_invite_email()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.role := lower(trim(coalesce(new.role, 'manager')));
  new.updated_at := now();
  return new;
end;
$function$;

comment on function public.leader_normalize_invite_email()
is 'РА Лидер: нормализует email и роль приглашения CRM перед записью.';

drop trigger if exists leader_user_invites_normalize_trg on public.leader_user_invites;

create trigger leader_user_invites_normalize_trg
before insert or update on public.leader_user_invites
for each row
execute function public.leader_normalize_invite_email();
