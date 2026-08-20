# vote-tilt — build log

Live gyroscope audience poll. Phones scan a QR, tilt toward one of six wedges,
the host freezes the screen to read the tally and pick what to demo next.

Plan: `C:\Users\DT6505\.claude\plans\vast-dreaming-piglet.md` (approved).
Handoff and hard-won facts: `tasks/build-handoff.md`.

---

## Done

- [x] **Scaffold** — Next.js 16.3.1, TypeScript, App Router, no Tailwind, Turbopack.
- [x] **Supabase project** `vote-tilt` (`bxgjkzlrncmvvcgiqyhm`, eu-west-1).
      `snake849-staging` paused to free the free-tier slot.
- [x] **`0001_init.sql`** — single-row `public.sessions`, RLS (anon SELECT only),
      six labels seeded, table added to the `supabase_realtime` publication.
- [x] **`0002_host_rpc.sql`** — no service-role key. `host_freeze` / `host_reset` /
      `host_set_options` are `security definer` and demand `HOST_DB_SECRET` from
      `private.host_config`. Smaller blast radius than an omnipotent key.
- [x] **Tilt engine** `lib/tilt.ts` — low-pass smoothing, 15° dead zone (10° release),
      8° hysteresis so a phone parked on a wedge border does not flicker.
- [x] **Presence transport** `lib/useRoom.ts` — one `tilt-room` channel, 120 ms publish
      throttle, host subscribes without `track()` so it never counts itself.
- [x] **Session sync** `lib/useSession.ts` — `postgres_changes` so a freeze lands on every
      phone without a refresh.
- [x] **Voter screen** `app/page.tsx` + `ActivateGate` (iOS gesture + no-sensor fallback)
      + `Dial` + `WinnerVeil`.
- [x] **Host screen** `app/host/page.tsx` + `HostBoard` / `HostLogin` / `QrPanel` /
      `OptionsEditor` / `CountUp`. Controls dim to `opacity: .07` until hover.
- [x] **Host auth** — httpOnly cookie, constant-time compare, 12 h expiry.
- [x] **Arcade pass** — Anton display face, six saturated hues, count-up numbers,
      slam-in winner reveal, `prefers-reduced-motion` honoured.
- [x] **First commit + private repo** — <https://github.com/thibb-org/vote-tilt>.

## Verified

| Check | Result |
|---|---|
| `npm test` (tilt math: wedges, dead zone, 200-sample jitter) | **7/7 pass** |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | clean |
| Freeze / reset / options without host cookie | **401** on all three |
| Wrong passcode / right passcode | 401 / 200 |
| Freeze end-to-end | row flips to `frozen=true` with tallies + timestamp |
| Options validation (5 labels) | 400 "Six non-empty labels required" |
| Security probes (wrong RPC secret, anon UPDATE, anon DELETE, `private` schema) | **8/8 pass** |
| Session reset after testing | `frozen=false`, tallies cleared — demo-ready |

## Open

- [ ] **Presence agreement check** — `scripts/check-presence.mjs` is written but cannot run
      here: Zscaler severs every WebSocket upgrade to `*.supabase.co`. Supabase's edge log
      shows it returning `101` each time; the client never receives it. Run from a phone
      hotspot. See `tasks/build-handoff.md` item 1 for the full evidence.
- [ ] **Deploy** — Vercel CLI installing; needs one interactive `! vercel login` from the user,
      then link, four env vars, `vercel --prod`.
- [ ] **Phone test on the live URL** — the only test that really counts.

## Review

Two things went differently from the plan, both for the better:

**No service-role key.** The plan called for `SUPABASE_SERVICE_ROLE_KEY` in a server-only
admin client. The MCP cannot hand out that key, and sending the user to the dashboard for an
omnipotent credential is the wrong trade anyway. Writes now go through three
`security definer` RPCs gated on a secret that only authorises those three operations.
Verified by probe: a wrong secret is rejected by all three, and anon still cannot touch the
row directly.

**Presence, not table writes.** This was in the plan and it held up. The consequence worth
remembering is that the frozen tally has to be posted *from the host browser* — Postgres
cannot see the presence map, so `POST /api/host/freeze` carries the counts the host is
already displaying. That keeps what gets frozen identical to what the room just saw.

**The one thing to watch on the day:** the host laptop must not be on Zscaler-managed
corporate wifi. Phones on cellular are fine; the laptop needs a hotspot or guest wifi, or the
host screen will sit at zero while the room tilts.
