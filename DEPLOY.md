# Deploying vote-tilt

Everything below runs on the Mac. Nothing here needs the Windows machine.

## 1. Clone

```bash
git clone https://github.com/thibb-corp/vote-tilt.git
cd vote-tilt
npm install
```

## 2. Environment

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase console → Project settings → your web app |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console → Project settings → Service accounts → Generate new private key, as one line of JSON |
| `HOST_TOKEN_SECRET` | anything long and random — it salts the host cookie |
| `HOST_PASSCODE` | anything you like — it is what you type on `/host` |
| `NEXT_PUBLIC_JOIN_ORIGIN` | optional; fills itself in from `VERCEL_PROJECT_PRODUCTION_URL` on Vercel. See "Which URL the QR points at" below |

`FIREBASE_SERVICE_ACCOUNT`, `HOST_TOKEN_SECRET` and `HOST_PASSCODE` are **not**
`NEXT_PUBLIC_`. The service account is the whole database; the other two are
the freeze controls. If any of them picks up that prefix it ships to every
phone in the room.

The passcode and the salt are independent of the database, so changing either
needs no migration — the host cookie simply stops matching and everyone signs
in again.

## 3. Deploy

```bash
npm i -g vercel
vercel login          # device-code flow, opens a browser
vercel link           # scope: thibb-work, project name: vote-tilt

for k in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
         NEXT_PUBLIC_FIREBASE_DATABASE_URL NEXT_PUBLIC_FIREBASE_PROJECT_ID \
         NEXT_PUBLIC_FIREBASE_APP_ID FIREBASE_SERVICE_ACCOUNT \
         HOST_TOKEN_SECRET HOST_PASSCODE; do
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

## Which URL the QR points at

**Only `https://vote-tilt.vercel.app` is open to phones.** The project has Vercel
Authentication switched on (`ssoProtection: all_except_custom_domains`), so all
three of its other addresses turn a stranger away:

| URL | What a phone gets |
|---|---|
| `vote-tilt.vercel.app` | the vote |
| `vote-tilt-thibblab.vercel.app` | 302 → `vercel.com/sso-api` |
| `vote-tilt-git-main-thibblab.vercel.app` | 302 → `vercel.com/sso-api` |
| `vote-tilt-<hash>-thibblab.vercel.app` | 302 → `vercel.com/sso-api` |

The host laptop carries the Vercel session cookie, so a walled URL looks perfect
on the projector while every phone in the room hits a sign-in page. That is the
failure this guards against: `QrPanel` asks, without credentials, whether a
stranger can open the origin it is about to encode, and falls back to
`NEXT_PUBLIC_JOIN_ORIGIN` when the answer is no. When there is no fallback it
says so instead of showing a code that scans cleanly and strands the room.

Two things worth doing:

- **Open the host screen on `vote-tilt.vercel.app/host`**, not on the deployment
  URL the Vercel dashboard links to. Then the code needs no fallback at all.
- **Consider turning Vercel Authentication off** for this project. It is a public
  audience poll; the protection buys nothing here and it is what makes preview
  deployments impossible to test by scanning.

`NEXT_PUBLIC_JOIN_ORIGIN` is filled from `VERCEL_PROJECT_PRODUCTION_URL` at build
time, which needs "Automatically expose System Environment Variables" left on
(it is on by default). Set it by hand for a custom domain or a non-Vercel host.

## Network warning

**The host laptop must not be behind Zscaler or a similar inspecting proxy.**
It severs WebSocket upgrades to `firebasedatabase.app`, and the whole live tally rides
one WebSocket. The symptom is a host screen that sits at zero while the room
tilts — no error, just nothing. Phones on cellular are unaffected.

Test for it in one line:

```bash
openssl s_client -connect vote-tilt-default-rtdb.firebaseio.com:443 -servername \
  vote-tilt-default-rtdb.firebaseio.com </dev/null 2>/dev/null | grep issuer
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

`HOST_TOKEN_SECRET` is independent of the passcode. Changing either only
invalidates the existing host cookie, so you sign in again and nothing else
moves — no migration, no database change.
