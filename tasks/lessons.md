# Lessons

## Pin down what a product word means before building a whole feature on it

**2026-08-23.** Asked for "a `/demo` that doesn't require a password and has lower
security features — max 5 users", I read *demo* as a **passwordless host console**:
QR panel, projector dial, lock control, and a five-phone cap enforced in Realtime
Database rules. It was planned, approved, built, verified against the live database
and deployed to production before the user said what they meant — a page that shows
a **single visitor** what the product does, with no host and no second person, to fix
the fact that the bare URL shows nothing without a QR code. The entire feature was
reverted, database rules included.

Every signal needed was in the original sentence. "Max 5 users" fits a shared room,
but "so I can do a quick demo to people" reads at least as easily as *show it to
someone*, and nothing said "run a round". The plan even quoted the ambiguity back
without resolving it.

**The rule:** when the deliverable is named by a word that could describe two
different artefacts — *demo*, *dashboard*, *preview*, *test page*, *admin* — settle
which one **before** designing, not after. One question at the top ("is this a
screen you drive for a room, or a page a stranger opens alone?") costs a round trip;
getting it wrong costs the build, the verification, and a production deploy.

A useful check: describe the artefact back in terms of **who is looking at it and
how many of them there are**. "A screen you project while five people tilt at it"
and "a page one person opens on a laptop" are obviously different products, and that
sentence would have exposed the gap immediately.

## Never let a secret reach a command line — not even inside `$(...)`

**2026-08-23.** Verifying the rotated host passcode against production, I built a
curl call as one compound command with the value interpolated through command
substitution:

```bash
code() { curl ... --data-binary "$(printf '{"passcode":"%s"}' "$1")"; }
echo "new passcode -> $(code "$HOST_PASSCODE")"
```

The shell failed to parse the compound construct and echoed **the entire failing
command back as the error message**, passcode included. Sourcing `.env.local` into
the environment was fine; putting the value into a command *string* was not.

**The rule:** a secret may live in the environment or in a file. It must never
appear in a command line, a shell function argument, or anything an error could
echo. Do credentialed checks in a **script file** that reads `process.env` and
prints only status codes. Pass bodies by file or stdin (`--data-binary @file`),
never by interpolation. The safe idiom, already used in `scripts/rotate-secrets.sh`:

```bash
printf '%s' "$VALUE" | vercel env add KEY production >/dev/null 2>&1
```

**Also worth knowing:** a failed parse here prints the whole command, so "the
command will fail harmlessly" is not a safe assumption.

## Confirm an API has the method your design depends on

**2026-08-23.** Planned the (since-reverted) five-phone cap around a database rule
counting children with `numChildren()`. Realtime Database rules have no such method
— `RuleDataSnapshot` exposes `hasChildren([...])` and nothing that counts. The
deploy rejected it after the approach had been presented and approved.

The replacement was better: five *named* slots, each owned by the uid that claimed
it, so a sixth phone had nowhere it was permitted to write — structural rather than
counted. But it cost a round trip that a syntax check would have prevented.

**The rule:** when a plan leans on a specific API surface — a rules method, a CLI
flag, a header — verify it exists while planning. `firebase deploy --only database`
validates rules syntax in seconds.

## A green browser test can be green for the wrong reason

**2026-08-28.** The end-to-end run for the orphaned-room warning came back 10/19,
and every one of the nine failures was the harness, not the app.

`innerText` returns text as *rendered*, and `.status-line` is
`text-transform: uppercase` — so `includes('Waiting for the first phone')` was
comparing against `WAITING FOR THE FIRST PHONE` and failing on a screen that was
correct. Use `textContent`, which is the DOM's own string.

Worse, `context.setOffline(true)` was never undone by `setOffline(false)`: the
context stayed dark, and eight later assertions read `Reconnecting` from a socket
that was still cut. One of them *passed* while doing so, because the case bug
inverted it. A test that passes while the thing it tests is broken is worse than
one that fails.

**The rules:**
- Assert on `textContent`, never `innerText`, wherever CSS may transform text.
- Anything that breaks the environment — offline, throttling, a killed process —
  gets its own throwaway context that is closed rather than restored.
- Before cutting a dependency to prove a failure mode, assert the *healthy* state
  first. `!warned` on a phone that never connected proves nothing; `!warned &&
  !line.includes('Reconnecting')` proves it was watched before the cut.
