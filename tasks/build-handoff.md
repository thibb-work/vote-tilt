# vote-tilt — build handoff

Live gyroscope audience poll. Phones scan a QR, tilt toward one of six wedges, host
freezes the screen to read the tally and decide what to demo next.

Plan file: `C:\Users\DT6505\.claude\plans\vast-dreaming-piglet.md` (approved).

---

## The five facts the next stretch needs

1. **Supabase project `vote-tilt` = ref `bxgjkzlrncmvvcgiqyhm`**, org `tfgieeuhjyxyvafhzrvm`,
   eu-west-1, free tier. `snake849-staging` (`kwpjtaxsohpkjkcmwwod`) was **paused** to free
   the slot — resume it in the dashboard when the user wants it back.
2. **This machine intercepts TLS.** Node cannot reach Supabase without a CA bundle. Exported
   Windows root store to
   `C:/Users/DT6505/AppData/Local/Temp/claude/C--Users-DT6505-Documents-dev-vote-tilt/e1003974-4c6b-4979-8f55-6e25a6dcbad5/scratchpad/corp-ca.pem`.
   **Every local `node`/`npm run dev` invocation that talks to Supabase needs
   `export NODE_EXTRA_CA_CERTS=<that path>` first.** Vercel is unaffected — do not ship a workaround.
3. **No service-role key is used.** Writes go through `security definer` RPCs
   (`host_freeze`, `host_reset`, `host_set_options`) that require `HOST_DB_SECRET`, stored in
   `private.host_config`. Anon has SELECT on `public.sessions` and nothing else.
4. **Secrets** (in `.env.local`, gitignored; `.env.example` is committed):
   - `NEXT_PUBLIC_SUPABASE_URL=https://bxgjkzlrncmvvcgiqyhm.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — publishable key (see `.env.local`, or Supabase dashboard → API keys)
   - `HOST_DB_SECRET` — long random string, must match `private.host_config.secret`
   - `HOST_PASSCODE` — the short code typed on `/host`
5. **Live votes never touch Postgres.** They ride one Realtime Presence channel
   (`tilt-room`); every client aggregates the same presence map. Postgres only holds labels,
   the frozen flag and the frozen tally.

---

## Done and verified

| Step | State | Evidence |
|---|---|---|
| Next.js 16.3.1 scaffold, TS, App Router, no Tailwind | done | `npm run build` clean |
| Supabase project + `0001_init.sql` (sessions table, RLS, realtime publication, seeded 6 labels) | done | `select` returns 1 row, 6 options |
| `0002_host_rpc.sql` (private schema, 3 RPCs, grants) | done | applied |
| `lib/tilt.ts` — smoothing, dead zone, hysteresis | done | **7/7 node tests pass** (`npm test`) |
| `lib/useRoom.ts` presence hook, `lib/useSession.ts` postgres_changes | done | not yet exercised in browser |
| Voter screen `app/page.tsx` + `ActivateGate` + `Dial` + `WinnerVeil` | done | builds; **never rendered in a browser yet** |
| Host screen `app/host/page.tsx` + `HostBoard`/`HostLogin`/`QrPanel`/`OptionsEditor`/`CountUp` | done | renders server-side (curl sees "Scan to join" with cookie) |
| Host auth boundary | done | freeze/reset/options all **401 without cookie**; wrong passcode 401; right passcode 200 |
| Freeze end-to-end | done | `{"ok":true}` → row shows `frozen=true` + tallies + timestamp |
| Options validation | done | 5 labels rejected with 400 |
| Security probes | done | **8/8 PASS** — wrong secret 401 on all 3 RPCs; anon UPDATE returns `[]`; `private.host_config` 404; row survives anon DELETE |
| Lint + typecheck | done | clean (`allowImportingTsExtensions` added to tsconfig for the `.ts` test import) |

---

## Not done — pick up here

1. **`scripts/check-presence.mjs` cannot run on this network — Zscaler blocks it, the app is fine.**
   Every WebSocket upgrade to `*.supabase.co` is severed by the corporate proxy. Evidence:
   - TLS cert for `bxgjkzlrncmvvcgiqyhm.supabase.co` is issued by `O=Zscaler Inc.` — the proxy
     terminates TLS for this host.
   - Supabase's own edge log records `GET | 101 | /realtime/v1/websocket` for every attempt
     with a valid key. The server completes the upgrade; the 101 never reaches the client,
     which sees `ECONNRESET` / zero bytes.
   - A *bogus* key returns a clean HTTP `401` through the same path, because a plain HTTP
     response is not a tunnelled WebSocket. That asymmetry is what makes it look key-related.
   - `wss://echo.websocket.org` opens fine (also Zscaler-inspected), so it is a per-host policy.

   **Consequence for the demo:** the host laptop must NOT be on Zscaler-managed corporate wifi,
   or the host screen will show zero votes. Use a phone hotspot or guest wifi. Phones on
   cellular are unaffected. Re-run the check from a hotspot to confirm the tally logic:
   ```
   export NODE_EXTRA_CA_CERTS=<pem path from fact 2>   # not needed off the corporate network
   set -a; . ./.env.local; set +a
   node scripts/check-presence.mjs
   ```
2. **Browser smoke test** — nothing has been rendered visually yet. **No dev server is
   running** (the background task was killed). Restart it with the CA bundle exported first,
   then check `/` and `/host` render, the dial responds to devtools sensor emulation, and a
   freeze on `/host` flips `/`.
   Note: `public.sessions` was reset to `frozen=false` after the API test — it is demo-ready.
3. **`git init` + private repo** — create-next-app already ran `git init`; **no commit exists yet**.
   Need: first commit, then `gh repo create Thibb-NJ/vote-tilt --private --source=. --push`.
   `gh` is authed as `Thibb-NJ` with `repo` scope.
4. **Deploy** — `npm i -g vercel`, then the **user** must run `! vercel login` (interactive,
   cannot be done for them). Then link, push the 4 env vars, `vercel --prod`.
5. **`tasks/todo.md`** — not written yet (budget hook blocked non-handoff writes).
6. **Phone test on the live URL** — the only test that really counts.

---

## Design decisions already settled with the user (do not relitigate)

- Compass dial, 6 × 60° wedges, centre dead zone = abstain.
- Live positions, frozen on command — not locked-in ballots.
- Phones show their own dial **and** live counts (bandwagon effect accepted deliberately).
- Host screen **is** the display; controls sit in a bottom bar at `opacity: .07` until hover.
- One live round, Reset clears it, no history.
- Playful/arcade styling: Anton display face, six saturated hues, count-up numbers,
  slam-in winner reveal.
- Six labels: Cool data collection / Bulk PDF editor / Dynamic concept explainer /
  Interactive slides / Animated website / Automated data extraction.
