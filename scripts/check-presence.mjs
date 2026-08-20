// Simulates phones on the real Realtime channel and checks that an observer
// (the host screen) aggregates the same tally the voters do.
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ROOM = 'tilt-room';
const WEDGES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  return createClient(BASE, KEY, { auth: { persistSession: false } });
}

function tally(channel) {
  const state = channel.presenceState();
  const counts = new Array(WEDGES).fill(0);
  let present = 0;
  for (const entries of Object.values(state)) {
    const e = entries[0];
    if (!e) continue;
    present++;
    if (typeof e.wedge === 'number' && e.wedge >= 0 && e.wedge < WEDGES) counts[e.wedge]++;
  }
  return { counts, present };
}

async function join(name, wedge, track) {
  const supabase = client();
  const channel = supabase.channel(ROOM, { config: { presence: { key: name } } });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(name + ' subscribe timeout')), 15000);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        if (track) await channel.track({ wedge });
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(name + ' -> ' + status));
      }
    });
  });
  return { supabase, channel };
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(name.padEnd(52), ok ? 'PASS' : 'FAIL', detail ?? '');
};

// The host observes without tracking, so it must not appear in the tally.
const host = await join('host-observer', null, false);
const a = await join('phone-a', 1, true);
const b = await join('phone-b', 1, true);
const c = await join('phone-c', 4, true);
const d = await join('phone-d', null, true); // flat, abstaining

await sleep(2500);

const h = tally(host.channel);
const seenByVoter = tally(a.channel);

check('host sees 4 phones (observer not counted)', h.present === 4, 'present=' + h.present);
check('tally is 2 on wedge 1, 1 on wedge 4', h.counts[1] === 2 && h.counts[4] === 1, JSON.stringify(h.counts));
check('abstainer counted present, not voting', h.counts.reduce((x, y) => x + y, 0) === 3, 'votes=' + h.counts.reduce((x, y) => x + y, 0));
check('voter and host agree exactly', JSON.stringify(seenByVoter.counts) === JSON.stringify(h.counts), JSON.stringify(seenByVoter.counts));

// A phone re-tilting must move the count, not add to it.
await c.channel.track({ wedge: 1 });
await sleep(2000);
const moved = tally(host.channel);
check('re-tilt moves a vote rather than adding', moved.counts[1] === 3 && moved.counts[4] === 0, JSON.stringify(moved.counts));

// A phone leaving must decrement.
await b.supabase.removeChannel(b.channel);
await sleep(2500);
const left = tally(host.channel);
check('leaving decrements within ~2.5s', left.present === 3 && left.counts[1] === 2, 'present=' + left.present + ' ' + JSON.stringify(left.counts));

for (const conn of [host, a, c, d]) await conn.supabase.removeChannel(conn.channel);

console.log('\n' + (results.every(Boolean) ? 'ALL PRESENCE CHECKS PASS' : 'SOME CHECKS FAILED'));
process.exit(results.every(Boolean) ? 0 : 1);
