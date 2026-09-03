// Agent 3 — Ranking. Runs an Elo tournament: pairwise "scientific debates" between
// hypotheses, updating ratings. Opus, effort high. Emits match + standings events.

import { MatchOut } from "../schemas.js";
import { fmtHypothesis, fmtReview } from "../format.js";
import { buildSchedule, applyMatch } from "../elo.js";
import { mapLimit } from "../pool.js";
import { mockMatch } from "../mock.js";

export async function ranking({ engine, state, emit, signal }) {
  const ids = state.activeIds();
  // Hypotheses that have never been in a debate yet get extra matches vs the top.
  const played = new Set(state.matchHistory.flatMap((m) => [m.a, m.b]));
  const newIds = ids.filter((id) => !played.has(id));
  const schedule = buildSchedule(ids, state.eloById, { newIds });
  let usageTotal = zeroUsage();

  await mapLimit(schedule, 3, async ([idA, idB]) => {
    if (signal?.aborted) return;
    const a = state.byId(idA);
    const b = state.byId(idB);
    if (!a || !b) return;

    emit("match.start", { a: { id: a.id, title: a.title }, b: { id: b.id, title: b.title } });

    const userContent =
      `ROLE: Tournament judge.\n` +
      `Two hypotheses compete to best advance the research goal. Debate both sides, then decide ` +
      `which is stronger overall (novelty + correctness + feasibility + testability). ` +
      `Return winner "A" or "B", your reasoning, and whether the margin is "clear" or "narrow".\n\n` +
      `HYPOTHESIS A (id=${a.id}):\n${fmtHypothesis(a)}\nReviews: ${fmtReview(state.reviews[a.id])}\n\n` +
      `HYPOTHESIS B (id=${b.id}):\n${fmtHypothesis(b)}\nReviews: ${fmtReview(state.reviews[b.id])}`;

    const { data, usage } = await engine.complete({
      agent: "ranking",
      userContent,
      schema: MatchOut,
      model: "opus",
      emit,
      signal,
      mock: () => mockMatch(),
    });

    const winnerId = data.winner === "A" ? a.id : b.id;
    const eloAfter = applyMatch(state.eloById, a.id, b.id, winnerId);
    state.matchHistory.push({
      a: a.id,
      b: b.id,
      winnerId,
      reasoning: data.reasoning,
      marginCloseness: data.marginCloseness,
      round: state.round,
    });
    accUsage(usageTotal, usage);
    state.addUsage(usage);

    emit("match.result", {
      winnerId,
      loserId: winnerId === a.id ? b.id : a.id,
      reasoning: data.reasoning,
      marginCloseness: data.marginCloseness,
      eloAfter,
    });
    emit("ranking.update", { standings: state.standings() });
  });

  emit("ranking.update", { standings: state.standings() });
  return { usage: usageTotal };
}

function zeroUsage() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costEstimate: 0 };
}
function accUsage(t, u) {
  if (!u) return;
  t.inputTokens += u.inputTokens || 0;
  t.outputTokens += u.outputTokens || 0;
  t.cacheReadTokens += u.cacheReadTokens || 0;
  t.cacheCreationTokens += u.cacheCreationTokens || 0;
  t.costEstimate += u.costEstimate || 0;
}
