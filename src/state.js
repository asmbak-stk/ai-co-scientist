// RunState — the single source of truth for one research run.
// The supervisor mutates it; agents read from it.

import { INITIAL } from "./elo.js";

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}

export class RunState {
  constructor(goal, opts = {}) {
    this.runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.goal = goal;
    this.rounds = opts.rounds ?? 3;
    this.webSearch = !!opts.webSearch;
    this.round = 0;

    this.hypotheses = []; // [{ id, title, summary, detailedDescription, rationale, proposedExperiment, round, derivedFrom?, strategy? }]
    this.reviews = {}; // { [hypothesisId]: { scores, critique, strengths, weaknesses, verdict } }
    this.eloById = {}; // { [hypothesisId]: number }
    this.matchHistory = []; // [{ a, b, winnerId, reasoning, marginCloseness, round }]
    this.clusters = []; // [{ label, hypothesisIds, redundancyNote }]
    this.metaReview = null; // { researchOverview, ..., generationFeedback }

    this.usage = {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costEstimate: 0,
    };

    this.aborted = false;
  }

  addHypothesis(h, { derived = false } = {}) {
    const id = nextId("h");
    const entry = { id, round: this.round, ...h };
    this.hypotheses.push(entry);
    this.eloById[id] = INITIAL;
    return entry;
  }

  activeIds() {
    return this.hypotheses.map((h) => h.id);
  }

  byId(id) {
    return this.hypotheses.find((h) => h.id === id);
  }

  attachReview(id, review) {
    this.reviews[id] = review;
  }

  // Top-K hypotheses by Elo, highest first.
  topK(k) {
    return [...this.hypotheses]
      .sort((a, b) => (this.eloById[b.id] ?? INITIAL) - (this.eloById[a.id] ?? INITIAL))
      .slice(0, k);
  }

  standings() {
    return [...this.hypotheses]
      .sort((a, b) => (this.eloById[b.id] ?? INITIAL) - (this.eloById[a.id] ?? INITIAL))
      .map((h, i) => ({ id: h.id, title: h.title, elo: this.eloById[h.id] ?? INITIAL, rank: i + 1 }));
  }

  addUsage(u) {
    if (!u) return;
    this.usage.cacheReadTokens += u.cacheReadTokens || 0;
    this.usage.cacheCreationTokens += u.cacheCreationTokens || 0;
    this.usage.inputTokens += u.inputTokens || 0;
    this.usage.outputTokens += u.outputTokens || 0;
    this.usage.costEstimate += u.costEstimate || 0;
  }
}
