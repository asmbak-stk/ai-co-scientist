// Agent 6 — Meta-review. Synthesizes patterns across all reviews and debates into a
// research overview + concrete feedback for the next Generation round. Opus, streamed.

import { MetaReviewOut } from "../schemas.js";
import { mockMeta } from "../mock.js";

export async function metaReview({ engine, state, emit, signal }) {
  const reviewLines = state.hypotheses
    .map((h) => {
      const r = state.reviews[h.id];
      if (!r) return `${h.id} "${h.title}": (no review)`;
      return `${h.id} "${h.title}": verdict=${r.verdict}; weaknesses=${r.weaknesses.join(", ")}`;
    })
    .join("\n");

  const debates = state.matchHistory
    .slice(-12)
    .map((m) => `${m.winnerId} beat ${m.winnerId === m.a ? m.b : m.a} (${m.marginCloseness}): ${m.reasoning}`)
    .join("\n");

  const clusters = state.clusters
    .map((c) => `${c.label}: [${c.hypothesisIds.join(", ")}] — ${c.redundancyNote}`)
    .join("\n");

  const standings = state
    .standings()
    .map((s) => `#${s.rank} ${s.title} (Elo ${s.elo})`)
    .join("\n");

  const userContent =
    `ROLE: Meta-review agent.\n` +
    `Synthesize the round into: a research overview (a few sentences), recurring strengths, recurring ` +
    `weaknesses, gaps not yet addressed, and concrete generationFeedback to steer the next round.\n\n` +
    `STANDINGS:\n${standings}\n\nREVIEWS:\n${reviewLines}\n\nDEBATES:\n${debates}\n\nCLUSTERS:\n${clusters}`;

  const { data, usage } = await engine.complete({
    agent: "metaReview",
    userContent,
    schema: MetaReviewOut,
    model: "opus",
    stream: true,
    emit,
    signal,
    mock: () => mockMeta(state),
    mockStreamText: (d) => d.researchOverview,
  });

  return { meta: data, usage };
}
