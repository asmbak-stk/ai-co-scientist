// Agent 4 — Evolution. Improves the top hypotheses (refine / combine / simplify / analogous).
// Opus, effort high.

import { EvolutionOut } from "../schemas.js";
import { fmtHypothesis, fmtReview } from "../format.js";
import { mockHypotheses } from "../mock.js";

export async function evolution({ engine, state, top, feedback, emit, signal }) {
  const block = top
    .map((h) => `id=${h.id}\n${fmtHypothesis(h)}\nReviews: ${fmtReview(state.reviews[h.id])}`)
    .join("\n\n");

  const userContent =
    `ROLE: Evolution agent.\n` +
    `Improve the strongest hypotheses below. Produce ${top.length} improved variants. For each, choose a ` +
    `strategy: "refine" (sharpen one), "combine" (merge two), "simplify" (reduce assumptions), or ` +
    `"analogous" (transfer the idea to a related mechanism). Record the parent id(s) in derivedFrom.\n` +
    (feedback ? `Apply this meta-review guidance:\n${feedback}\n` : "") +
    `\nTOP HYPOTHESES:\n${block}`;

  const { data, usage } = await engine.complete({
    agent: "evolution",
    userContent,
    schema: EvolutionOut,
    model: "opus",
    stream: true,
    allowWebSearch: true,
    emit,
    signal,
    mock: () =>
      ({
        hypotheses: mockHypotheses(state.goal, top.length, {
          evolved: true,
          parents: top.map((h) => h.id),
        }),
      }),
    mockStreamText: (d) => d.hypotheses.map((h) => `↳ [${h.strategy}] ${h.title}`).join("\n"),
  });

  return { hypotheses: data.hypotheses, usage };
}
