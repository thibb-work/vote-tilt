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


## A memoised promise memoises the failure too

`roomAuth()` cached `Promise<string>` in a module variable and returned it to
every caller. That is the right shape for a value; it is the wrong shape for an
attempt. A rejected promise stays rejected, so one refused sign-in at load broke
a page for as long as it stayed open, and nothing retried because the cache
looked like a completed answer.

Rules:

- Cache the resolution, not the attempt. If a memoised promise rejects, clear
  the slot so the next caller starts a new one.
- A dependency every read and write passes through does not get one chance.
  Retry it.
- `void somePromise()` discards the rejection. Where the promise *is* the proof
  that the feature works -- the host's tally write was exactly this -- attach
  the handler and record that it landed.

## Fix the silence at both ends, not just the end that reported it

Last round the phone was made honest about a room nobody was reading; the host
was left rendering `'error'` and `'connecting'` as the same word, and a QR code
that scans identically whether or not the screen behind it is connected. The
detector found the fault and pointed at the half that was already fine, which
cost a full extra round.

Rule: when adding a detector to one side of a link, check what the other side
shows in the same failure. A screen that keeps inviting people into a room it
cannot serve is the more expensive half of the bug.

## Read the database before theorising

The cause was found by listing `/rooms` with an admin token and noticing one
room with live phone writes and no tally node, ever. That one query eliminated
rules, clock skew, CSP, room-id drift and deployment split -- each of which had
a plausible story and would have taken a browser session to test.

## A constant outlives the transport it was tuned for

The dial felt slow because phones published every 300ms. That number was chosen
for Supabase Realtime Presence, a transport this app stopped using in the same
commit that introduced the number. Nothing was wrong with the code; the reason
for it had simply been deleted around it.

Rule: when a migration carries a tuning constant across, say in the comment
which system it was tuned for. A number with no live justification reads as
deliberate forever, and "it was always like that" is not a measurement.

## Measure the budget before optimising any part of it

Three plausible culprits for the sluggish dial: the network, the publish rate,
the easing. Timing a real tilt end to end settled it in one run --
`settled - first move` came out at 275ms in every round, which was the CSS
transition exactly, and a round trip to the database measured 15ms. The network,
the obvious suspect, was 5% of the budget.

Rule: instrument the whole path first and read off which term dominates. It also
tells you when to stop, and when the dominant term has moved somewhere new --
here it moved to the phone's smoothing filter, which no amount of further work
on the network or the easing would have touched.

## An empty rejection handler is a silence you will pay for twice

`set(...).then(ok, () => {})` was written to stop an unhandled rejection. What
it actually did was throw away the only evidence of why the write failed, and
the app already had four faults that presented as the same silence. Two rounds
went into guessing what a single `PERMISSION_DENIED` would have said outright.

Rule: never discard a rejection to quiet a warning. If a failure is not worth
showing, record why it happened anyway; the cost of a swallowed reason is a
whole round of investigation, and it is paid by whoever is standing at the
projector.

## Timestamps in a shared database belong to the server

Two independent bugs, one cause: the rules validate `t` against server time,
and phones are aged out against the reader's `Date.now()`. Both meant a browser
whose clock was off failed silently -- one refusing every write, the other
declaring a room full of healthy phones stale on arrival.

Rule: when a value is compared across machines, both sides use the same clock.
RTDB hands it over on `.info/serverTimeOffset`; there is no reason to guess.

## Truncate a log before you re-run into it

A poll waiting for `passed` matched the *previous* run's output twice, and a fix
that worked the first time looked like it had failed. The rig was lying, not the
code.

Rule: delete the output file before the run that writes it, or poll on
something the previous run could not have produced.
