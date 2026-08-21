-- Optional hardening. NOT YET APPLIED to the live database.
--
-- The host secret is stored in plaintext, so keeping the database, Vercel and a
-- local .env in agreement means the value has to pass through a terminal to be
-- compared. Storing the digest instead lets it be set and checked without the
-- secret itself ever being displayed.
--
-- Deliberately backward compatible: assert_host accepts a plaintext match OR a
-- digest match, so applying this cannot break a host that currently works.
-- Once secret_sha256 is populated, clear the plaintext column:
--
--   update private.host_config
--      set secret_sha256 = encode(sha256(convert_to('<the secret>', 'UTF8')), 'hex')
--    where slug = 'main';
--   update private.host_config set secret = null where slug = 'main';

alter table private.host_config add column if not exists secret_sha256 text;
alter table private.host_config alter column secret drop not null;

create or replace function private.assert_host(p_secret text)
returns void language plpgsql security definer set search_path = private as $$
begin
  if not exists (
    select 1 from private.host_config
    where slug = 'main'
      and (
        secret = p_secret
        or secret_sha256 = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
      )
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end $$;
