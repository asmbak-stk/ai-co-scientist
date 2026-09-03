// Mock engine — runs the FULL co-scientist loop with no API calls, no key, no cost.
//
// It fabricates varied-but-plausible hypotheses/reviews/debates so the orchestration,
// Elo tournament, SSE plumbing and frontend can be exercised end-to-end. The output
// shapes match the real schemas exactly, so the supervisor and frontend can't tell
// which engine produced them.

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        },
        { once: true }
      );
    }
  });

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function keywords(goal) {
  const stop = new Set([
    "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with",
    "effekten", "av", "ulike", "på", "og", "i", "the", "effect", "different",
    "how", "what", "why", "does", "do", "between", "mechanisms", "linking",
  ]);
  const words = goal
    .toLowerCase()
    .replace(/[^a-zà-ÿæøå0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  return words.length ? words : ["systemet", "fenomenet", "variabelen"];
}

const ANGLES = [
  "a dose–response relationship",
  "a mediating mechanism",
  "a moderating context factor",
  "a threshold/non-linear effect",
  "a feedback loop",
  "an overlooked confounder",
  "a temporal lag effect",
  "an interaction between two factors",
];

const METHODS = [
  "a randomized controlled trial with pre/post measurement",
  "a longitudinal cohort followed over time",
  "a natural experiment exploiting an exogenous policy change",
  "a within-subject crossover design",
  "a matched quasi-experiment with a difference-in-differences estimator",
  "a stepped-wedge rollout across sites",
];

let mockSeq = 0;

export function mockHypotheses(goal, count, { evolved = false, parents = [] } = {}) {
  const kw = keywords(goal);
  const out = [];
  for (let i = 0; i < count; i++) {
    mockSeq += 1;
    const a = pick(kw);
    const b = kw.length > 1 ? pick(kw.filter((w) => w !== a)) : pick(kw);
    const angle = pick(ANGLES);
    const method = pick(METHODS);
    const strat = pick(["refine", "combine", "simplify", "analogous"]);
    const base = {
      title: evolved
        ? `Refined: ${cap(a)} and ${b} via ${angle}`
        : `${cap(a)} drives ${b} through ${angle}`,
      summary: `Proposes that ${a} influences ${b} via ${angle}, relevant to: "${goal}".`,
      detailedDescription:
        `We hypothesize that variation in ${a} produces measurable change in ${b}. ` +
        `The relationship is best characterized as ${angle}, which would explain ` +
        `patterns that a simple linear account misses. (Mock hypothesis #${mockSeq}.)`,
      rationale:
        `Prior reasoning suggests ${a} and ${b} are coupled; framing it as ${angle} ` +
        `yields a sharper, falsifiable prediction.`,
      proposedExperiment: `Test with ${method}, measuring ${b} as the primary outcome while manipulating ${a}.`,
    };
    if (evolved) {
      base.derivedFrom = parents.length ? [pick(parents)] : [];
      base.strategy = strat;
    }
    out.push(base);
  }
  return out;
}

export function mockReview() {
  const r = () => 4 + Math.floor(Math.random() * 7); // 4..10
  const scores = {
    novelty: r(),
    correctness: r(),
    feasibility: r(),
    testability: r(),
    safety: 8 + Math.floor(Math.random() * 3),
  };
  const avg =
    (scores.novelty + scores.correctness + scores.feasibility + scores.testability) / 4;
  const verdict = avg >= 8 ? "accept" : avg >= 6 ? "revise" : "reject";
  return {
    scores,
    critique:
      "Mock review: the proposed mechanism is plausible and testable, but the causal pathway " +
      "needs tighter specification and a clearer control condition.",
    strengths: ["Falsifiable prediction", "Concrete experimental handle"],
    weaknesses: ["Possible confounding", "Effect size likely modest"],
    verdict,
  };
}

export function mockMatch() {
  return {
    winner: Math.random() < 0.5 ? "A" : "B",
    reasoning:
      "Mock debate: both advance the goal, but the winner offers a more directly testable " +
      "mechanism with fewer confounds.",
    marginCloseness: Math.random() < 0.5 ? "clear" : "narrow",
  };
}

export function mockClusters(hyps) {
  if (!hyps.length) return { clusters: [] };
  const mid = Math.ceil(hyps.length / 2);
  const a = hyps.slice(0, mid).map((h) => h.id);
  const b = hyps.slice(mid).map((h) => h.id);
  const clusters = [
    {
      label: "Mechanistic accounts",
      hypothesisIds: a,
      redundancyNote: a.length > 2 ? "Some overlap in proposed mechanism." : "Distinct.",
    },
  ];
  if (b.length) {
    clusters.push({
      label: "Contextual / moderating factors",
      hypothesisIds: b,
      redundancyNote: "Largely complementary.",
    });
  }
  return { clusters };
}

export function mockMeta(state) {
  const top = state.standings()[0];
  return {
    researchOverview:
      `Across ${state.hypotheses.length} hypotheses over ${state.round} round(s), the strongest ` +
      `candidate is "${top ? top.title : "—"}". The pool converges on mechanistic, testable ` +
      `accounts of the research goal, with the main open question being how to isolate the ` +
      `proposed effect from confounders. (Mock meta-review.)`,
    recurringStrengths: ["Falsifiable predictions", "Concrete experimental designs"],
    recurringWeaknesses: ["Confounding risk", "Uncertain effect sizes"],
    gaps: ["Few hypotheses address mediating mechanisms directly"],
    generationFeedback:
      "Next round: prioritize hypotheses with explicit mediators and stronger control conditions; " +
      "avoid restating the top candidate.",
  };
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// The mock engine: same `complete` contract as the Claude engine, but it calls the
// agent-supplied `mock` thunk instead of the API, and simulates streaming/latency.
export function makeMockEngine() {
  async function complete({ agent, stream, emit, signal, mock, mockStreamText }) {
    await wait(250 + Math.random() * 350, signal); // simulate "thinking"
    const data = mock();

    if (stream && emit) {
      const text = (mockStreamText ? mockStreamText(data) : "") || "";
      const chunks = text.match(/.{1,28}/g) || [];
      for (const c of chunks) {
        if (signal?.aborted) break;
        emit("agent.delta", { agent, text: c });
        await wait(35, signal);
      }
    }

    return {
      data,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costEstimate: 0,
      },
    };
  }
  return { mode: "mock", model: "mock", webSearch: false, complete };
}
