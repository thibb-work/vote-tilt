-- Defence in depth on public.sessions.
--
-- RLS already refuses every write from the browser: the table has one policy and
-- it is SELECT-only, so an UPDATE or DELETE matches zero rows. But the table
-- grants still said anon may write, which left row-level security as the single
-- thing between a public key and the round state -- and a write filtered to
-- zero rows returns success, so the failure would be silent either way.
--
-- Taking the grants away makes the refusal explicit and removes the dependency
-- on one policy staying correct. The host_* functions are security definer, so
-- they are unaffected.

revoke insert, update, delete, truncate, references, trigger
  on public.sessions from anon, authenticated;
