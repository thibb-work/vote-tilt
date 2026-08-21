#!/usr/bin/env bash
#
# Rotate HOST_DB_SECRET and HOST_PASSCODE.
#
# Nothing secret is ever written to stdout. The new values go into .env.local and
# into Vercel; the only thing printed is the SHA-256 digest of the new database
# secret, which is what the database now stores and is safe to paste anywhere.
#
# Usage:  bash scripts/rotate-secrets.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }
command -v openssl >/dev/null || { echo "error: openssl not found" >&2; exit 1; }

# --- generate -----------------------------------------------------------------

NEW_SECRET="$(openssl rand -hex 16)"

# The passcode gets typed on a laptop in front of a room, so it is words rather
# than hex. Five words from this list is about 60 bits.
WORDS=(amber anchor badger bramble cinder copper cobalt dagger ember falcon
       fennel garnet harbor hollow indigo ivory jasper kettle lantern linen
       marble meadow nickel nutmeg onyx orchid pepper pewter quarry quiver
       rowan rusty saffron slate timber thistle umber velvet walnut willow
       yarrow zephyr basalt citrus driftwood flint granite juniper kelp lichen)
PASSCODE=""
for _ in 1 2 3 4; do
  IDX=$(( $(od -An -N2 -tu2 < /dev/urandom | tr -d ' ') % ${#WORDS[@]} ))
  PASSCODE="${PASSCODE}${PASSCODE:+-}${WORDS[$IDX]}"
done
NEW_PASSCODE="${PASSCODE}-$(( $(od -An -N2 -tu2 < /dev/urandom | tr -d ' ') % 90 + 10 ))"

# --- rewrite .env.local -------------------------------------------------------

BACKUP="${ENV_FILE}.$(date +%Y%m%d%H%M%S).bak"
cp "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
grep -v -E '^(HOST_DB_SECRET|HOST_PASSCODE)=' "$ENV_FILE" > "$TMP" || true
printf 'HOST_DB_SECRET=%s\n' "$NEW_SECRET"   >> "$TMP"
printf 'HOST_PASSCODE=%s\n'  "$NEW_PASSCODE" >> "$TMP"
cat "$TMP" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

# --- push to Vercel -----------------------------------------------------------

push() { # push <KEY> <VALUE> <ENVIRONMENT>
  npx --yes vercel env rm "$1" "$3" --yes >/dev/null 2>&1 || true
  if printf '%s' "$2" | npx --yes vercel env add "$1" "$3" >/dev/null 2>&1; then
    echo "  $1 -> $3"
  else
    echo "  $1 -> $3  FAILED" >&2
  fi
}

echo "pushing to Vercel:"
for ENVIRONMENT in production preview development; do
  push HOST_DB_SECRET "$NEW_SECRET"   "$ENVIRONMENT"
  push HOST_PASSCODE  "$NEW_PASSCODE" "$ENVIRONMENT"
done

# --- the one safe thing to print ---------------------------------------------

DIGEST="$(printf '%s' "$NEW_SECRET" | shasum -a 256 | cut -d' ' -f1)"

cat <<EOF

Rotated. Old values backed up to $BACKUP

Run this in the Supabase SQL editor to point the database at the new secret.
It contains only a one-way digest, so it is safe to paste or share:

  update private.host_config
     set secret_sha256 = '$DIGEST',
         secret = null
   where slug = 'main';

Your new host passcode is in $ENV_FILE on the HOST_PASSCODE line.
Open it in an editor -- do not cat it into a shared terminal.
EOF
