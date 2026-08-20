-- Writes are host-only. Rather than shipping a service-role key to Vercel, the
-- three mutating actions are security-definer functions that demand a secret the
-- browser never sees: the host route handlers hold it in HOST_DB_SECRET and pass
-- it through. Anon keeps SELECT and nothing else.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.host_config (
  slug   text primary key,
  secret text not null
);

create or replace function private.assert_host(p_secret text)
returns void language plpgsql security definer set search_path = private as $$
begin
  if not exists (
    select 1 from private.host_config
    where slug = 'main' and secret = p_secret
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.host_freeze(p_secret text, p_tallies jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform private.assert_host(p_secret);
  update public.sessions
     set frozen = true, frozen_tallies = p_tallies,
         frozen_at = now(), updated_at = now()
   where slug = 'main';
end $$;

create or replace function public.host_reset(p_secret text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform private.assert_host(p_secret);
  update public.sessions
     set frozen = false, frozen_tallies = null, frozen_at = null,
         round_started = now(), updated_at = now()
   where slug = 'main';
end $$;

create or replace function public.host_set_options(p_secret text, p_options text[])
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform private.assert_host(p_secret);
  if array_length(p_options, 1) is distinct from 6 then
    raise exception 'exactly six options required';
  end if;
  update public.sessions
     set options = p_options, updated_at = now()
   where slug = 'main';
end $$;

revoke all on function public.host_freeze(text, jsonb)      from public;
revoke all on function public.host_reset(text)              from public;
revoke all on function public.host_set_options(text, text[]) from public;
grant execute on function public.host_freeze(text, jsonb)       to anon, authenticated;
grant execute on function public.host_reset(text)               to anon, authenticated;
grant execute on function public.host_set_options(text, text[]) to anon, authenticated;
