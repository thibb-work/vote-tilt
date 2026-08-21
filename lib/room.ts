/**
 * Per-round room id.
 *
 * The database URL ships in the client bundle and the repo is public, so a
 * fixed room path is an open invitation: anyone who reads the bundle knows
 * exactly where to write fake phones. The room id closes that. It is minted in
 * the host's browser, never stored in Postgres and never baked into the bundle,
 * and it reaches a phone only by scanning the QR code -- so knowing where to
 * write requires having been in the room.
 *
 * This does not stop someone who scanned the code from writing extra nodes.
 * Per-phone ownership needs authentication; this is the half that can be done
 * without it.
 */

/** Unambiguous in a URL and when read aloud: no vowels, no look-alike glyphs. */
const ALPHABET = '23456789bcdfghjkmnpqrstvwxz';
export const ROOM_ID_LENGTH = 14;

export function newRoomId(): string {
  const bytes = new Uint8Array(ROOM_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Rejects anything that is not a room id we would have minted. */
export function isRoomId(value: string | null | undefined): value is string {
  if (!value || value.length !== ROOM_ID_LENGTH) return false;
  for (const ch of value) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export const ROOM_QUERY_KEY = 'r';
export const HOST_ROOM_STORAGE_KEY = 'vt_room';

/**
 * The host's room id as an external store.
 *
 * It lives in localStorage rather than React state so a refresh does not strand
 * every phone already in the room, and it is exposed through
 * useSyncExternalStore because the server cannot know it -- there is no room id
 * until a browser mints one.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let cached: string | null = null;

export function subscribeHostRoomId(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable across calls, so it is safe as a getSnapshot. */
export function hostRoomIdSnapshot(): string {
  if (cached) return cached;
  const stored = window.localStorage.getItem(HOST_ROOM_STORAGE_KEY);
  cached = isRoomId(stored) ? stored : newRoomId();
  window.localStorage.setItem(HOST_ROOM_STORAGE_KEY, cached);
  return cached;
}

/** Mint a fresh code. Everyone holding the old one falls out of the room. */
export function retireHostRoomId(): void {
  cached = newRoomId();
  window.localStorage.setItem(HOST_ROOM_STORAGE_KEY, cached);
  for (const listener of listeners) listener();
}
