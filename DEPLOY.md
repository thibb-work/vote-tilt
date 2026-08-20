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
