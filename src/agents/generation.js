// Agent 1 — Generation. Proposes novel, testable hypotheses for the research goal.
// Opus, effort high, streamed, may use web_search to "read the literature".

import { GenerationOut } from "../schemas.js";
import { mockHypotheses } from "../mock.js";

export async function generation({ engine, state, count, feedback, existingTitles, emit, signal }) {
  const userContent =
    `ROLE: Generation agent.\n` +
    `Generate ${count} novel, testable hypotheses for the research goal in the system prompt.\n` +
    (feedback ? `Incorporate this meta-review guidance from the previous round:\n${feedback}\n` : "") +
    (existingTitles?.length
      ? `Do NOT duplicate or trivially restate these existing hypotheses:\n- ${existingTitles.join("\n- ")}\n`
      : "") +
    `Each hypothesis must state what is proposed, why it is plausible (rationale), and a concrete ` +
    `proposed experiment. Keep titles under ~12 words and summaries to 1-2 sentences.`;

  const { data, usage } = await engine.complete({
    agent: "generation",
    userContent,
    schema: GenerationOut,
    model: "opus",
    stream: true,
    allowWebSearch: true,
    emit,
    signal,
    mock: () => ({ hypotheses: mockHypotheses(state.goal, count) }),
    mockStreamText: (d) => d.hypotheses.map((h) => `• ${h.title}: ${h.summary}`).join("\n"),
  });

  return { hypotheses: data.hypotheses, usage };
}
