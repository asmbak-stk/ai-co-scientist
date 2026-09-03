// Elo tournament math for the Ranking agent.
//
// Hypotheses start at INITIAL. Each "scientific debate" between two hypotheses
// produces a winner; we update both ratings with the standard Elo formula.

export const INITIAL = 1200;
const K = 32;

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Apply one match result to a ratings map { [id]: number }.
// winner is the id of the winning hypothesis. Returns the two new ratings.
export function applyMatch(ratings, idA, idB, winnerId) {
  const ra = ratings[idA] ?? INITIAL;
  const rb = ratings[idB] ?? INITIAL;
  const ea = expectedScore(ra, rb);
  const eb = expectedScore(rb, ra);
  const scoreA = winnerId === idA ? 1 : 0;
  const scoreB = winnerId === idB ? 1 : 0;
  const newA = Math.round(ra + K * (scoreA - ea));
  const newB = Math.round(rb + K * (scoreB - eb));
  ratings[idA] = newA;
  ratings[idB] = newB;
  return { [idA]: newA, [idB]: newB };
}

// Build the match schedule for one ranking round.
// - Round 1 (no meaningful ratings yet): shuffle and pair neighbours.
// - Later rounds: Swiss-style — sort by rating and pair neighbours, so debates
//   are between comparable hypotheses. Brand-new ids are also paired against the
//   current top to give them a fast read on where they stand.
// Caps the number of matches so cost stays bounded.
export function buildSchedule(ids, ratings, { newIds = [], cap = 12 } = {}) {
  if (ids.length < 2) return [];

  const sorted = [...ids].sort((a, b) => (ratings[b] ?? INITIAL) - (ratings[a] ?? INITIAL));
  const hasHistory = ids.some((id) => (ratings[id] ?? INITIAL) !== INITIAL);

  const order = hasHistory ? sorted : shuffle([...ids]);
  const pairs = [];

  // neighbour pairing
  for (let i = 0; i + 1 < order.length; i += 2) {
    pairs.push([order[i], order[i + 1]]);
  }
  // odd one out plays the current leader
  if (order.length % 2 === 1) {
    pairs.push([order[order.length - 1], order[0]]);
  }
  // new hypotheses challenge the top to get ranked quickly
  const top = sorted[0];
  for (const nid of newIds) {
    if (nid !== top) pairs.push([nid, top]);
  }

  // target ~1.5 matches per hypothesis, capped
  const target = Math.min(cap, Math.ceil(ids.length * 1.5));
  return dedupe(pairs).slice(0, target);
}

function dedupe(pairs) {
  const seen = new Set();
  const out = [];
  for (const [a, b] of pairs) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
