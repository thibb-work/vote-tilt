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

---

# The QR pointed at a URL phones cannot open (2026-08-27)

## What is wrong

`QrPanel` mints the join link from `window.location.origin`, so the code encodes
whatever URL the host laptop is on. The Vercel project has Vercel Authentication
enabled (`ssoProtection.deploymentType = "all_except_custom_domains"`), so:

| URL | Stranger sees |
|---|---|
| `vote-tilt.vercel.app` (production alias) | 200 |
| `vote-tilt-<hash>-thibblab.vercel.app` | 302 → `vercel.com/sso-api` |
| `vote-tilt-git-main-thibblab.vercel.app` | 302 → `vercel.com/sso-api` |

Open `/host` from the Vercel dashboard — which always links the *deployment* URL —
and the QR encodes a walled origin. The laptop passes on its Vercel cookie, so the
host screen looks perfect; the phone has no cookie and lands on a login page.

The comment on `QrPanel` claims the origin trick means it "works on preview URLs
too". With protection on, previews are the only URLs where it cannot work.

## The shape of the fix

Not "always use a canonical URL" — that would send a preview's scanners to
production and make voter-page changes untestable. Instead: **ask whether a
stranger can open this origin, and only then reach for a fallback.**

- [x] `lib/joinOrigin.ts` — pure `chooseJoinOrigin({ current, canonical, reach })`
      returning the origin to encode plus a reason. No DOM, no fetch.
- [x] `lib/useJoinOrigin.ts` — thin hook. Probes `/` once per host session with
      `credentials: 'omit'` (what a phone sees, not what the signed-in host sees)
      and `redirect: 'manual'`. 2xx → `public`; anything else → `unreachable`;
      a thrown request → `unknown`, which fails **open** to today's behaviour.
- [x] `next.config.ts` — inline the canonical origin at build time:
      `NEXT_PUBLIC_JOIN_ORIGIN` if set, else `https://$VERCEL_PROJECT_PRODUCTION_URL`.
      Zero config on Vercel, overridable anywhere.
- [x] `components/QrPanel.tsx` — render from the chosen origin, caption included,
      so the text under the code can never disagree with the code. No QR at all
      while the answer is unknown; an actionable message when the origin is
      walled and no fallback exists.
- [x] `test/joinOrigin.test.ts` — every combination of the three inputs.
- [x] `.env.example` + `DEPLOY.md` — document `NEXT_PUBLIC_JOIN_ORIGIN`.

Do **not** probe the canonical origin: the app's own CSP `connect-src` is `'self'`
plus the database hosts, so a cross-origin probe is blocked by policy.

## How it gets proven

Deployed previews are walled, so Playwright cannot reach one and driving a Vercel
login is off limits. Reproduce the topology locally instead:

```
next start (port A)  <--  proxy (port B)
  no `_vercel_jwt` cookie -> 302 https://vercel.com/sso-api?...
  cookie present          -> pass through
```

Browser navigation carries the cookie, so the host sees the board exactly as today.
The probe omits credentials, so it gets the 302. Faithful, and no login anywhere.

- [x] decode the QR **pixels** with `jsqr` — the image is what users scan, a DOM
      string would only prove what we already believe;
- [x] fetch the decoded URL with credentials omitted and assert 200.

## Review

Shipped as planned, with one thing the plan did not foresee: `setSrc('')` at the top
of the encoding effect tripped `react-hooks/set-state-in-effect`. The rule was right.
The QR is now kept beside the link it was drawn from (`{ link, src }`) and displayed
only when the two agree, which removes the stale-code window entirely instead of
papering over it with an extra render — encoding is asynchronous, so a bare `src`
kept showing the previous origin's code until the new one resolved, and a stale code
scans exactly as cleanly as a live one.

| Check | Result |
|---|---|
| `npm test` | **84/84**, nine of them new |
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | clean |
| QC — walled origin, fallback configured | **9/9** |
| QC — public origin | **3/3** |
| QC — walled origin, no fallback | **2/2** |

The QC ran against `next start` behind a proxy that mirrors Vercel Authentication:
302 to `vercel.com/sso-api` without the `_vercel_jwt` cookie, pass-through with it.
The browser navigation carried the cookie and the probe did not, which is exactly
the asymmetry that hid the bug in production. Every case decoded the QR from its own
pixels with `jsqr`, and the walled case then fetched the decoded URL with no cookies
at all and got a 200 carrying the vote page — the phone's journey, end to end.

Not verified, and it cannot be from here: that `VERCEL_PROJECT_PRODUCTION_URL` is
actually exposed to this project's builds. It is on by default. If it is off, the
fallback is empty and a host on a walled URL gets the "no code to show" message
rather than a working code — safe, but not the intended answer. Confirm on the next
deployment, or set `NEXT_PUBLIC_JOIN_ORIGIN` by hand.

# Phones vanish into a room nobody is watching (2026-08-28)

## The question

Is a server-side room id the best fix, given only `vote-tilt.vercel.app` matters
and the goal is "users' tilt shows on /host"?

No. It solves cross-origin drift, which that constraint removes, and it misses
the failures that will actually happen.

## What actually breaks

`hostRoomIdSnapshot()` (lib/room.ts:60) mints the room into origin-scoped
localStorage; the phone gets its room from `?r=` in the scanned URL
(app/page.tsx:23). They disagree whenever:

- the host clears site data, uses a private window, or a second laptop
- the host presses **New QR** -- one click, no confirmation, everyone orphaned
- the phone still has an old tab open from a previous round
- (removed by the constraint) the host is on a different origin

A server-side room id fixes only the last two-thirds of one bullet. It cannot
fix a stale phone tab, which keeps its old `?r=` regardless.

## The real defect: the failure is silent

- Host shows `0 phones` identically for "nobody scanned", "everyone is in a
  retired room", and "socket down".
- Phone shows a working dial and the word **live** while writing into a room no
  host reads. `room.status` only reports its own socket.

Neither side says anything. That is why this is confusing rather than merely broken.

## The fix: let the phone notice it is alone

The host already writes `rooms/<id>/tally` every 250ms unconditionally
(TALLY_INTERVAL_MS, lib/useRoom.ts) and the phone already subscribes to it. That
write is an unclaimed heartbeat: **tally updates arriving == a host is watching
this exact room.**

So the phone can detect an orphaned room with no new infrastructure, no new
route, no rules change, and no extra bandwidth.

- [x] `lib/roomWatch.ts` -- pure `roomWatchState({ live, msSinceTally, msSinceSettled, graceMs })`,
      testable without a browser, in the style of `lib/joinOrigin.ts`
- [x] Measure staleness by **arrival time on the phone**, never by the embedded
      `t` -- that is the host's clock, and skew would produce false alarms
- [x] Only assert it while `status === 'live'`; a dropped socket is a different
      message and already has one
- [x] Reset the grace clock on reconnect and on `visibilitychange`, so a phone
      waking from background does not flash the warning
- [x] Voter UI: "Waiting for the host screen -- if the code changed, scan it
      again." Honest about both causes (retired code, host screen closed)
- [x] Keep publishing while orphaned. It costs nothing and recovers by itself
      if the host comes back

## Companions (small, same failure)

- [x] Confirm before **New QR**. It is a plain button beside Lock votes on a
      projector and one misclick empties the room silently
- [x] Host status line: distinguish "connecting" from "live, nobody here yet"

## Rejected

- **Server-side room id + cookie-gated route** -- correct, but the constraint
  removes its payoff; most code, touches auth and rules, still misses stale tabs
- **Fixed room, no id** -- simplest, but the DB URL ships in a public bundle and
  the repo is public: remote ballot stuffing walks straight in
- **Room id in `sessions/main`** -- those rules grant read to `auth != null`, so
  every phone could read it; an unguessable id anyone can fetch is not unguessable
- **Room id in the host URL (`/host?r=`)** -- no server needed, but it puts the
  secret in the address bar of a projected screen
- **Deleting URLs 2-4** -- the generated `.vercel.app` domains are not removable,
  and the per-deploy hash URL cannot be turned off at all

## Review (2026-08-28)

Shipped as described. Six files:

- `lib/roomWatch.ts` -- the whole decision, pure. `ORPHAN_GRACE_MS = 5000`,
  which is twenty of the host's tally writes.
- `test/roomWatch.test.ts` -- 10 cases, including the two that make it
  trustworthy: a dropped socket is never reported as an orphaned room, and
  positive evidence outranks the grace window.
- `lib/useRoom.ts` -- records tally *arrival* time, restarts the grace clock on
  connect and on `visibilitychange`, and ticks once a second because silence is
  not an event and nothing else would ever notice it.
- `app/page.tsx` -- the warning, below a red dot.
- `components/HostBoard.tsx` -- "Waiting for the first phone", and New QR now
  asks twice.
- `app/globals.css` -- two rules.

One thing changed from the plan: the pure function takes `graceMs` as a
parameter so a test does not have to sleep five seconds.

### Proof

`npm test` 94/94, `npm run lint` clean, `npm run build` clean. Then a real
end-to-end run -- production build on :3400, real Firebase, real host screen,
real phones driven by a synthetic gyroscope -- 19/19, including the reported
failure reproduced and then reported by the phone:

```
PASS  the host sees the phone arrive                   -- 1 phone · 1 aiming
PASS  a watched room raises no warning                 -- Aiming at Dynamic concept explainer
PASS  an offline phone says Reconnecting               -- Reconnecting
PASS  and never blames the room for its own socket     -- Reconnecting
PASS  one click on New QR only arms it                 -- Confirm — drops everyone
PASS  the room survived the misclick
PASS  THE BUG: a phone left in the retired room now says so
PASS  a room that never had a host is reported too
PASS  scanning the new code clears the warning         -- 1 phone · 1 aiming
```

Harness at `scratchpad/e2e/orphan.mjs`. Two harness bugs were found and fixed
before the results meant anything: `innerText` returns the uppercased render, so
every text assertion silently failed; and a Playwright context taken offline
never came back, which hid nine later results behind one stuck socket. The
offline case now runs in a context of its own.

### Left behind

The test run created a handful of `rooms/<id>/tally` nodes in the production
database, ~50 bytes each. The rules deny a root read, so they cannot be
enumerated to delete; they are inert and bounded to that one run.

### Not done

`HOST_PASSCODE` is still un-rotated. Since Vercel Authentication went off it is
the only wall in front of Freeze and Reset, reachable from every preview
deployment. `scripts/rotate-secrets.sh` mints one.



## Round two (2026-08-28): the host, not the phone

The warning shipped last round was correct and the room was still broken. Read
from the live database: the phone was writing into `rooms/<id>/phones/<uid>`
every second or two, and that room had never received a single tally -- nor had
any room, for two and a half hours. The phone was healthy. No host was serving.

Ruled out first, all against production: deployed rules byte-identical to
`database.rules.json`; this machine's clock 151ms from Google's, against a 5s
validation window; identical CSP on `/` and `/host`, `connect-src` naming both
Firebase hosts; one production deployment on the current commit, no preview
split. The same code serving from this machine into the same database works.

**Root cause.** `roomAuth()` memoised its promise -- rejections included:

    let uid: Promise<string> | null = null;
    export function roomAuth() { if (uid) return uid; ... }

and `useRoom` asked exactly once, catching the failure into `status: 'error'`.
So a single refused anonymous sign-in at page load -- a laptop still waking, a
wifi handover, a captive portal answering the first request -- left the tab
permanently unable to read or write, for as long as it stayed open. Nothing
said so. `QrPanel` does not depend on auth, so the projector went on displaying
a crisp, scannable QR code, and `HostBoard` rendered `'error'` and
`'connecting'` with the same word: "Connecting".

Every phone that scanned that code then joined a room nobody was reading.

- [x] `roomAuth()` forgets a failed attempt instead of caching it forever
- [x] `useRoom` retries sign-in every 3s rather than giving up on the page
- [x] the host verifies its own tally writes -- `set()` rejections were dropped
      on the floor, so the host had no idea whether anything landed
- [x] the watch ticker runs for both roles: a phone trusts tallies that arrive,
      a host trusts tallies that are accepted
- [x] `HostBoard` names the failure: "Cannot sign in — retrying", "Not reaching
      the room — phones will not be counted"
- [x] `QrPanel` greys out a code it cannot honour, and says why
- [x] the phone's hint says "QR code", not "code" -- the wording sent the host
      hunting for a text code that does not exist

**Proof.** `test/e2e/host-recovery.mjs`, real browsers against the real
database, blocking `identitytoolkit.googleapis.com` for the host only:

    PASS  THE BUG: it says it cannot sign in, instead of "Connecting" forever
    PASS  and the QR code is marked unscannable rather than looking healthy
    PASS  the phone reports the room nobody is reading
    PASS  THE FIX: the host signs in on its own, with no reload
    PASS  the host now sees the phone that was already waiting
    PASS  and the phone stops warning, without being touched
    PASS  a healthy host never flashes the warning

12/12, plus the previous 19/19 orphan suite unchanged, 94/94 unit, lint and
build clean.

Still not done: `HOST_PASSCODE` is unrotated, and since Vercel Authentication
came off it is the only wall in front of Freeze and Reset on every deployment
URL. `scripts/rotate-secrets.sh` mints one.

## Round three (2026-08-28): why the host dial got sluggish

Not a bug -- a constant that outlived its reason. Positions used to ride
Supabase Realtime Presence, whose free tier caps out around twenty messages a
second, so the RTDB migration in `4e6ee2d` slowed phones from publishing every
120ms to every 300ms and set the dot easing to 280ms to match. RTDB has no such
cap, and the database sits in europe-west1, but the throttle travelled with the
code.

**Measured first.** `test/e2e/latency.mjs` steps a real phone between two
opposite tilts and times the host dot, both pages in one browser so the clock is
shared. Median of eleven steps, before:

    dot starts moving  287ms
    dot has arrived    561ms

`settled - first move` was 275ms in every single round, which is the CSS
transition to the millisecond. Network was never the problem: a TCP round trip
to europe-west1 measures 15ms, about 5% of the budget.

- [x] `PUBLISH_INTERVAL_MS` 300 -> 100, moved to `lib/constants.ts`
- [x] the dot easing reads it as `--dot-travel` instead of keeping a second copy
      that can drift out of step with the cadence it is tuned to
- [x] the tilt filter relaxes with sustained travel, so a swing is not smoothed
      as hard as a wobble

The third one is where the remaining time had moved. A single smoothing weight
has to hide three degrees of sensor noise *and* keep up with an arm sweeping the
dial; tuned for the first it costs a third of a second on the second. Smoothing
the *signed* change separates them -- noise is zero-mean and cancels, real
movement pushes the same way sample after sample and accumulates.

**Proof.** Same harness, same eleven steps, after:

    dot starts moving   72ms   (4.0x)
    dot has arrived    263ms   (2.1x)

And the filter change costs nothing at rest, which is the half that could have
gone wrong. On identical noise, held still:

    unfiltered        wanders 8.0 deg
    fixed 0.2         wanders 4.8 deg
    adaptive          wanders 4.8 deg     <- unchanged
    60 deg sweep      16.7 deg behind the hand -> 1.6 deg

96/96 unit including two new filter tests, 12/12 host-recovery, 19/19 orphan,
lint and build clean.

**What the room actually costs.** Measured off the host's websocket frames, not
estimated: 1.5 KB/s per phone at 14 frames/s. The project is on the free Spark
plan, so downloaded bytes are the ceiling -- 10 GB/month.

    10 phones -> ~55 MB/hour   -> 183 hours of a full room
    30 phones -> ~164 MB/hour  ->  61 hours of a full room

Tripling the publish rate is not close to a limit. `TALLY_INTERVAL_MS` stays at
250ms deliberately: it is the one fan-out that multiplies by room size, and the
host's own numbers never come from it -- they are folded locally, every frame.

Still not done: `HOST_PASSCODE` is unrotated.
