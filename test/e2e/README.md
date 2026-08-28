# End-to-end harnesses

Real browsers, a real production build, and the real Firebase database. They
exist because both of this app's worst failures were invisible to unit tests:
a phone writing into a room nobody read, and a host screen displaying a QR code
it could not honour.

    npm run build
    NEXT_PUBLIC_FIREBASE_...=... npx next start -p 3400   # or: set -a; . test/e2e/app.env; set +a
    node test/e2e/orphan.mjs          # 19 checks: the orphaned-room warning
    node test/e2e/host-recovery.mjs   # 12 checks: a host refused its identity
    node test/e2e/clock.mjs           # 6 checks: screens whose clocks are wrong
    node test/e2e/returning.mjs       # 15 checks: a host that has been here before
    node test/e2e/latency.mjs         # how long a tilt takes to move a host dot
    node test/e2e/bandwidth.mjs       # what one phone costs the host on the wire

The last two print numbers rather than pass or fail: they are for deciding
whether a change is worth making and whether the room can afford it. Run
`latency.mjs` before and after touching any of the timing constants.

`app.env` sits beside these files and is gitignored. It holds the five public
`NEXT_PUBLIC_FIREBASE_*` values -- they ship in every phone's bundle by design
-- plus a throwaway `HOST_PASSCODE` and `HOST_TOKEN_SECRET` for the local
server. Do not point it at production secrets.

Three traps these harnesses have already fallen into, all of which made a broken
app look green:

- Assert on `textContent`, never `innerText`. The status lines are
  `text-transform: uppercase`, so `innerText` comes back shouting and every
  comparison fails on a correct screen.
- Anything that breaks the environment -- `setOffline`, a blocked route -- gets
  its own context that is closed afterwards, or is explicitly undone. A context
  left offline silently poisons every check after it.

- **Never assert on an element the page builds asynchronously without polling.**
  The QR image only exists once `QRCode.toDataURL` resolves, which is a beat
  after the surrounding layout appears. A bare `count() > 0` there passes or
  fails on machine speed; wrap it in `until`.

- **Truncate a log before re-running into it.** A poll that waits for `passed`
  to appear will match the *previous* run's output and report a stale result --
  which is how a fix that worked first time looked like it had failed twice.
