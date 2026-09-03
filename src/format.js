// Compact text renderers used to put hypotheses/reviews into agent prompts.

export function fmtHypothesis(h) {
  return [
    `Title: ${h.title}`,
    `Summary: ${h.summary}`,
    `Description: ${h.detailedDescription}`,
    `Rationale: ${h.rationale}`,
    `Proposed experiment: ${h.proposedExperiment}`,
  ].join("\n");
}

export function fmtReview(r) {
  if (!r) return "(not yet reviewed)";
  const s = r.scores;
  return (
    `scores novelty=${s.novelty} correctness=${s.correctness} feasibility=${s.feasibility} ` +
    `testability=${s.testability} safety=${s.safety}; verdict=${r.verdict}; ${r.critique}`
  );
}
