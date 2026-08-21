-- Applied.
--
-- The host secret was stored in plaintext, so keeping the database, Vercel and a
-- local .env in agreement means the value has to pass through a terminal to be
-- compared. Storing the digest instead lets it be set and checked without the
-- secret itself ever being displayed.
--
-- Deliberately backward compatible: assert_host accepts a plaintext match OR a
-- digest match, so applying this could not break a host that was already
-- working. The plaintext column has since been cleared, so the digest is now
-- the only stored credential.
--
-- scripts/rotate-secrets.sh mints a new secret, pushes it to .env.local and
-- Vercel, and prints only the digest to paste here.

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
