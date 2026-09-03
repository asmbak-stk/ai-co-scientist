// Agent 2 — Reflection. Peer-reviews one hypothesis on five axes. Opus, effort high.

import { ReviewOut } from "../schemas.js";
import { fmtHypothesis } from "../format.js";
import { mockReview } from "../mock.js";

export async function reflection({ engine, hypothesis, emit, signal }) {
  const userContent =
    `ROLE: Reflection agent (rigorous peer reviewer).\n` +
    `Critically assess the following hypothesis against the research goal.\n` +
    `Score each axis as an integer 0-10: novelty, correctness, feasibility, testability, safety.\n` +
    `Provide a concise critique, list concrete strengths and weaknesses, and a verdict ` +
    `(accept / revise / reject).\n\n` +
    fmtHypothesis(hypothesis);

  const { data, usage } = await engine.complete({
    agent: "reflection",
    userContent,
    schema: ReviewOut,
    model: "opus",
    allowWebSearch: true,
    emit,
    signal,
    mock: () => mockReview(),
  });

  return { review: data, usage };
}
