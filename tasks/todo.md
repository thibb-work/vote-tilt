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
- [x] **First commit + private repo** — <https://github.com/thibb-corp/vote-tilt>.

## Verified

| Check | Result |
|---|---|
| `npm test` — tilt math, presence tally, jsonb round-trip, label wrapping | **29/29 pass** |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | clean |
| Freeze / reset / options without host cookie | **401** on all three |
| Wrong passcode / right passcode | 401 / 200 |
| Freeze end-to-end | row flips to `frozen=true` with tallies + timestamp |
| Options validation (5 labels) | 400 "Six non-empty labels required" |
| Security probes (wrong RPC secret, anon UPDATE, anon DELETE, `private` schema) | **8/8 pass** |
| Session reset after testing | `frozen=false`, tallies cleared — demo-ready |
| Supabase security advisors | 6 warnings, all three host RPCs — **accepted by design**, see review |
| Both routes render at runtime | `/` 200 with the gate, `/host` 200 with the passcode form, zero server errors |

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

---

## Addendum — work done while deploy was blocked

**Presence aggregation is now tested without a socket.** `aggregatePresence` moved out of
the `useRoom` effect into `lib/presence.ts`, and `test/presence.test.ts` carries the same
six assertions `scripts/check-presence.mjs` would have made. That script still cannot run
on this network, but the logic it was written to protect is no longer untested.

**Two real defects fixed in `wrapLabel`.** Labels are editable mid-demo, and anything past
three lines was being dropped silently — no ellipsis, no warning. A word wider than the
wedge was also never broken, so it spilled past the dial. Both are now covered. All six
shipped labels fit at 12 chars, but two sit exactly on the three-line cap, so the silent
path was one typed word away.

**Supabase security advisors: 6 warnings, all accepted.** Every one is the same finding
against `host_freeze`, `host_reset` and `host_set_options` — "public can execute a
SECURITY DEFINER function". That is the design. The linter cannot see that each function
calls `private.assert_host(p_secret)` and raises `42501` before touching anything, which
the probe suite verifies. The alternative it suggests — a service-role key — is a strictly
larger blast radius. Brute-forcing a 32-character random secret over HTTP is not a
practical attack, and the only thing an attacker gains is the ability to reset a poll.

**What is still unproven and cannot be proven here:** the dial responding to a real
gyroscope, and a freeze landing on a phone. Both need the deployed HTTPS URL and a phone.

---

## Addendum — host passcode and the demo page (2026-08-23)

**Passcode pushed.** `HOST_PASSCODE` from `.env.local` is in all three Vercel
environments and live in production (the new value returns 200 on
`/api/host/login`, a wrong one 401). `HOST_DB_SECRET` was deliberately **not**
touched — unchanged since the 21 Aug rotation and confirmed still accepted by the
database via an idempotent `host_set_options` that rewrote the existing labels to
themselves, so Vercel’s copy was already correct.

**`/demo` added** — a single-visitor page that answers "the bare URL shows
nothing without a QR code". A dial that is already moving, a needle the visitor
drives themselves, and one control that toggles the rest of the room in and out.
The surrounding phones are
simulated in `lib/demoRoom.ts` and the page says so. It opens no socket at all:
no Firebase, no Supabase, so it cannot touch the round `/host` drives. The
"Scan to join" empty state now links to it, which is the whole point.

## Review

**I built the wrong thing first, and it cost a full cycle.** "Demo" was read as a
passwordless *host console* — QR panel, big screen, lock, and a five-phone cap
enforced by Realtime Database rules. That was designed, built, verified against the
live database and deployed before the user said what they actually wanted: a page
that shows a visitor what the product does, with no host involved. All of it was
reverted, database rules included. Recorded in `tasks/lessons.md`.

**What replaced it is much smaller.** No rooms, no rules, no cap — there is nobody
to cap, because nobody else joins. `lib/demoRoom.ts` is pure arithmetic with the
randomness injected, so the drift is unit-tested without a browser and without
waiting for real seconds to pass.

**The demo has to work on a laptop.** This is the detail that decides whether the
page does its job. Whoever lands on the bare URL is usually on the machine they
were already using, and `ActivateGate` refuses without a motion sensor — which
would drop them back at the same dead end the page exists to fix. So the pointer
drives the needle by default and a gyroscope takes over on its own where there is
one. `pointerToReading` maps distance from the hub onto the real 15° dead zone, so
the demo teaches the real behaviour rather than an approximation of it.

**Verified:** 64/64 unit tests (9 new, covering drift, range safety over 2000 steps,
flat phones landing in the hub, and the pointer compass against all six wedges);
lint, typecheck and build clean; `/demo` and the `/` link render in production.

Not verifiable here: how the drift *feels*, and a real gyroscope driving it. Both
need eyes on the deployed page.

## Open

- [ ] **Look at `/demo` and judge the pace.** `SIM_PHONE_COUNT`, `EASE`,
      `MIN_DWELL_MS`/`MAX_DWELL_MS` and `ABSTAIN_CHANCE` in `lib/demoRoom.ts` are
      the dials to turn if the room feels too busy, too fast or too static.
- [ ] **Preview deployments are broken** — `NEXT_PUBLIC_SUPABASE_URL` and
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist only in Production, so preview builds
      error. Unrelated to this work; `/demo` is unaffected since it reads neither.
- [ ] **Host passcode is in the 2026-08-23 session transcript** — leaked by a shell
      parse failure that echoed the command. Left in place by decision; the recipe
      to rotate it is in `DEPLOY.md`.

### Follow-up (2026-08-24) — the demo controls

The winner reveal is gone from `/demo`: "Lock votes" was replaced by a single toggle
that turns the simulated room on and off. Its label says what pressing it does —
**Just me** while the room is running, **Simulate other users** once it is off — so
the control is never a no-op whichever state the page is in.

Granting motion access now clears the dial down to one phone. Someone who has just
tapped **Use my phone's tilt** is trying to see what their own handset does, and
picking their needle out of eleven other dots works against that.

The automatic path is deliberately different. On Android, tilt is detected from the
first real sample without anyone asking for it, and there the room keeps running —
dots vanishing a moment after landing would read as a glitch rather than a choice.
Only the explicit tap clears the dial.

`WinnerVeil` is still used by the real voter screen, so nothing was orphaned. Say the
word if the reveal should come back to the demo as a third control.
