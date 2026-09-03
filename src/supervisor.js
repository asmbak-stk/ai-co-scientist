// Supervisor — sequences the six agents across iterative rounds over one RunState,
// emitting SSE events so the browser watches the tournament unfold.

import { generation } from "./agents/generation.js";
import { reflection } from "./agents/reflection.js";
import { ranking } from "./agents/ranking.js";
import { evolution } from "./agents/evolution.js";
import { proximity } from "./agents/proximity.js";
import { metaReview } from "./agents/metaReview.js";
import { mapLimit } from "./pool.js";

const TOKEN_BUDGET = Number(process.env.TOKEN_BUDGET || 2_000_000);

export async function runResearch({ state, engine, emit, signal }) {
  const checkAbort = () => {
    if (signal?.aborted || state.aborted) throw new Error("aborted");
  };
  const usageEvent = () => emit("usage", { ...state.usage, mode: engine.mode, model: engine.model });

  emit("run.start", {
    runId: state.runId,
    goal: state.goal,
    rounds: state.rounds,
    mode: engine.mode,
    model: engine.model,
    webSearch: engine.webSearch,
  });

  let prevTopId = null;
  let stableRounds = 0;

  for (let r = 1; r <= state.rounds; r++) {
    checkAbort();
    state.round = r;
    emit("round.start", { round: r });

    // 1. Generation -----------------------------------------------------------
    emit("agent.start", { agent: "generation", round: r });
    const count = r === 1 ? 6 : 3;
    const gen = await generation({
      engine,
      state,
      count,
      feedback: state.metaReview?.generationFeedback,
      existingTitles: state.hypotheses.map((h) => h.title),
      emit,
      signal,
    });
    state.addUsage(gen.usage);
    for (const h of gen.hypotheses) {
      const entry = state.addHypothesis(h);
      emit("hypothesis.new", { hypothesis: entry });
    }
    emit("agent.done", { agent: "generation", round: r });
    usageEvent();
    checkAbort();

    // 2. Reflection (review everything not yet reviewed) ----------------------
    const toReview = state.hypotheses.filter((h) => !state.reviews[h.id]);
    emit("agent.start", { agent: "reflection", round: r, count: toReview.length });
    await mapLimit(toReview, 3, async (h) => {
      if (signal?.aborted) return;
      const { review, usage } = await reflection({ engine, hypothesis: h, emit, signal });
      state.attachReview(h.id, review);
      state.addUsage(usage);
      emit("review.done", { hypothesisId: h.id, scores: review.scores, verdict: review.verdict });
    });
    emit("agent.done", { agent: "reflection", round: r });
    usageEvent();
    checkAbort();

    // 3. Ranking (Elo tournament) --------------------------------------------
    emit("agent.start", { agent: "ranking", round: r });
    await ranking({ engine, state, emit, signal });
    emit("agent.done", { agent: "ranking", round: r });
    usageEvent();
    checkAbort();

    // 4. Evolution (improve the top) -----------------------------------------
    emit("agent.start", { agent: "evolution", round: r });
    const top = state.topK(2);
    const evo = await evolution({
      engine,
      state,
      top,
      feedback: state.metaReview?.generationFeedback,
      emit,
      signal,
    });
    state.addUsage(evo.usage);
    for (const h of evo.hypotheses) {
      const entry = state.addHypothesis(h, { derived: true });
      emit("hypothesis.evolved", { hypothesis: entry });
    }
    emit("agent.done", { agent: "evolution", round: r });
    usageEvent();
    checkAbort();

    // 5. Proximity (cluster) --------------------------------------------------
    emit("agent.start", { agent: "proximity", round: r });
    const prox = await proximity({ engine, state, emit, signal });
    state.addUsage(prox.usage);
    state.clusters = prox.clusters;
    emit("clusters.update", { clusters: prox.clusters });
    emit("agent.done", { agent: "proximity", round: r });
    usageEvent();
    checkAbort();

    // 6. Meta-review (synthesize + steer next round) -------------------------
    emit("agent.start", { agent: "metaReview", round: r });
    const mr = await metaReview({ engine, state, emit, signal });
    state.addUsage(mr.usage);
    state.metaReview = mr.meta;
    emit("metareview.done", {
      researchOverview: mr.meta.researchOverview,
      recurringStrengths: mr.meta.recurringStrengths,
      recurringWeaknesses: mr.meta.recurringWeaknesses,
      gaps: mr.meta.gaps,
      generationFeedback: mr.meta.generationFeedback,
    });
    emit("agent.done", { agent: "metaReview", round: r });
    usageEvent();

    emit("round.end", { round: r });

    // Termination checks -----------------------------------------------------
    const standings = state.standings();
    const top1 = standings[0];
    const top2 = standings[1];
    if (top1 && top2 && top1.elo - top2.elo > 100 && top1.id === prevTopId) {
      stableRounds += 1;
      if (stableRounds >= 1) {
        emit("note", { message: "Converged: a clear, stable leader emerged. Stopping early." });
        break;
      }
    } else {
      stableRounds = 0;
    }
    prevTopId = top1?.id ?? null;

    const totalTokens =
      state.usage.inputTokens + state.usage.outputTokens + state.usage.cacheReadTokens;
    if (engine.mode === "claude" && totalTokens > TOKEN_BUDGET) {
      emit("note", { message: `Token budget (${TOKEN_BUDGET}) reached. Stopping early.` });
      break;
    }
  }

  const standings = state.standings();
  emit("run.done", {
    topHypothesis: standings[0] ? state.byId(standings[0].id) : null,
    standings,
    usage: state.usage,
  });
}
