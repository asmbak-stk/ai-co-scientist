// Agent 5 — Proximity. Clusters semantically similar hypotheses and flags redundancy.
// Cheap structural step → Haiku, not Opus.

import { ClusterOut } from "../schemas.js";
import { mockClusters } from "../mock.js";

export async function proximity({ engine, state, emit, signal }) {
  const list = state.hypotheses
    .map((h) => `id=${h.id} | ${h.title} | ${h.summary}`)
    .join("\n");

  const userContent =
    `ROLE: Proximity agent.\n` +
    `Group the following hypotheses into clusters of similar ideas. For each cluster give a short ` +
    `label, the list of hypothesis ids, and a note on any redundancy. Every id must appear in exactly ` +
    `one cluster.\n\n${list}`;

  const { data, usage } = await engine.complete({
    agent: "proximity",
    userContent,
    schema: ClusterOut,
    model: "haiku",
    emit,
    signal,
    mock: () => mockClusters(state.hypotheses),
  });

  return { clusters: data.clusters, usage };
}
