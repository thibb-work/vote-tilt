# Deploying vote-tilt

Everything below runs on the Mac. Nothing here needs the Windows machine.

## 1. Clone

```bash
git clone https://github.com/thibb-corp/vote-tilt.git
cd vote-tilt
npm install
```

## 2. Environment

Four variables. Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bxgjkzlrncmvvcgiqyhm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API keys → publishable |
| `HOST_DB_SECRET` | must match `private.host_config.secret` (see below) |
| `HOST_PASSCODE` | anything you like — it is what you type on `/host` |

`HOST_DB_SECRET` and `HOST_PASSCODE` are **not** `NEXT_PUBLIC_`. If either
picks up that prefix it ships to every phone in the room and the freeze
controls stop being yours.

If you would rather not carry the old secret across machines, pick a new one
and tell the database about it:

```sql
-- Supabase dashboard → SQL editor
insert into private.host_config (slug, secret) values ('main', '<new secret>')
on conflict (slug) do update set secret = excluded.secret;
```

Then put the same value in `HOST_DB_SECRET`. The passcode is independent — it
never reaches the database, so changing it needs no SQL.

## 3. Deploy

```bash
npm i -g vercel
vercel login          # device-code flow, opens a browser
vercel link           # scope: personal or thibb-corp, project name: vote-tilt

for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY HOST_DB_SECRET HOST_PASSCODE; do
  grep "^$k=" .env.local | cut -d= -f2- | vercel env add "$k" production
done

vercel --prod
```

## 4. Check it before the room does

1. Open the production URL on the laptop, go to `/host`, enter the passcode.
2. Scan the QR with a phone. Tap **Activate gyroscope** and allow motion access.
   iOS will not deliver orientation events otherwise, and it requires HTTPS —
   which is why this has to be tested on the deployed URL, not `localhost`.
3. Tilt through all six wedges. The host counter should follow within ~120 ms.
4. Lie the phone flat — the vote should drop out and the total stay.
5. Hit **Freeze** on the host. The phone should switch to the result view with
   no refresh. Hit **Reset** and confirm it goes live again.

## Network warning

**The host laptop must not be behind Zscaler or a similar inspecting proxy.**
It severs WebSocket upgrades to `supabase.co`, and the whole live tally rides
one WebSocket. The symptom is a host screen that sits at zero while the room
tilts — no error, just nothing. Phones on cellular are unaffected.

Test for it in one line:

```bash
openssl s_client -connect bxgjkzlrncmvvcgiqyhm.supabase.co:443 -servername \
  bxgjkzlrncmvvcgiqyhm.supabase.co </dev/null 2>/dev/null | grep issuer
```

A real issuer means you are fine. `O = Zscaler Inc.` means switch to a hotspot.

## Running the checks

```bash
npm test          # 29 unit tests, no network
npm run lint
npm run build
```

`scripts/check-presence.mjs` is an integration check that opens five real
Realtime connections and asserts the tally agrees across all of them. It needs
a network that permits WebSockets to Supabase:

```bash
set -a; . ./.env.local; set +a
node scripts/check-presence.mjs
```

## The demo page (`/demo`)

`https://vote-tilt.vercel.app/demo` exists for one reason: opening the bare URL
without a QR code shows a "Scan to join" wall, which makes a working product look
broken to anyone who just followed the link. `/demo` is the way out of that dead
end, and the empty state now links to it.

It is a **single-visitor page, not a second host console**. There is no room, no
QR code, no host, and no cap, because nobody else joins it:

- the surrounding phones are simulated in `lib/demoRoom.ts` — pure arithmetic on
  a timer, stated on the page so nobody mistakes them for live votes;
- it opens no socket. Nothing on this page touches Firebase or Supabase, so it
  cannot affect the round `/host` drives and keeps working if either is down;
- the six labels are `FALLBACK_OPTIONS`.

**It has to work on a laptop.** The people it exists for have usually just opened
the URL on whatever they were already using, and `ActivateGate` refuses outright
without a motion sensor — which would send them back to the same dead end. So a
pointer drives the needle by default, and a real gyroscope takes over on its own
where the hardware offers one. On iOS, where the sensor needs a gesture, a "Use my
phone’s tilt" button appears.

`pointerToReading` maps distance from the hub onto the same 15° dead zone the real
dial uses, so what the demo teaches matches what a phone does.

Nothing here needs deploying beyond `vercel --prod`. There are no database rules
involved.

### Rotating the host passcode

`scripts/rotate-secrets.sh` mints both secrets and pushes them. To change only
the passcode, edit `HOST_PASSCODE` in `.env.local` and push it without letting
the value reach the terminal:

```bash
set -a; . ./.env.local; set +a
for e in production preview development; do
  vercel env rm HOST_PASSCODE "$e" --yes >/dev/null 2>&1
  printf '%s' "$HOST_PASSCODE" | vercel env add HOST_PASSCODE "$e"
done
vercel --prod        # env changes only take effect on a new deployment
```

`HOST_DB_SECRET` is independent and must keep matching `private.host_config`;
changing it needs the SQL in section 2.
