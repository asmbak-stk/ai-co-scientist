// Structured-output schemas for the co-scientist agents.
//
// Each agent that returns structured data has two representations:
//   - `*.jsonSchema`  : a JSON Schema object passed to the Claude API via
//                       output_config.format. Must obey the API's structured-output
//                       limits: every object has additionalProperties:false, and we
//                       avoid unsupported keywords (minLength, maximum, multipleOf, ...).
//                       Bounds like "0..10" are enforced in the Zod layer / prose, not here.
//   - `*.zod`         : a Zod schema used to validate the parsed JSON after the call.
//
// The mock engine produces objects of the same shape, so downstream code never
// needs to know which engine produced them.

import { z } from "zod";

// ---- helpers ---------------------------------------------------------------

const obj = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const strArray = { type: "array", items: { type: "string" } };

// ---- Generation / Evolution: a hypothesis ---------------------------------

const hypothesisProps = {
  title: { type: "string" },
  summary: { type: "string" },
  detailedDescription: { type: "string" },
  rationale: { type: "string" },
  proposedExperiment: { type: "string" },
};

export const GenerationOut = {
  jsonSchema: obj(
    {
      hypotheses: {
        type: "array",
        items: obj(hypothesisProps, [
          "title",
          "summary",
          "detailedDescription",
          "rationale",
          "proposedExperiment",
        ]),
      },
    },
    ["hypotheses"]
  ),
  zod: z.object({
    hypotheses: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        detailedDescription: z.string(),
        rationale: z.string(),
        proposedExperiment: z.string(),
      })
    ),
  }),
};

const STRATEGY = ["refine", "combine", "simplify", "analogous"];

export const EvolutionOut = {
  jsonSchema: obj(
    {
      hypotheses: {
        type: "array",
        items: obj(
          {
            ...hypothesisProps,
            derivedFrom: strArray, // parent hypothesis ids
            strategy: { type: "string", enum: STRATEGY },
          },
          [
            "title",
            "summary",
            "detailedDescription",
            "rationale",
            "proposedExperiment",
            "derivedFrom",
            "strategy",
          ]
        ),
      },
    },
    ["hypotheses"]
  ),
  zod: z.object({
    hypotheses: z.array(
      z.object({
        title: z.string(),
        summary: z.string(),
        detailedDescription: z.string(),
        rationale: z.string(),
        proposedExperiment: z.string(),
        derivedFrom: z.array(z.string()),
        strategy: z.enum(STRATEGY),
      })
    ),
  }),
};

// ---- Reflection: a structured review --------------------------------------

const scoreProps = {
  novelty: { type: "integer" },
  correctness: { type: "integer" },
  feasibility: { type: "integer" },
  testability: { type: "integer" },
  safety: { type: "integer" },
};

const VERDICT = ["accept", "revise", "reject"];

export const ReviewOut = {
  jsonSchema: obj(
    {
      scores: obj(scoreProps, [
        "novelty",
        "correctness",
        "feasibility",
        "testability",
        "safety",
      ]),
      critique: { type: "string" },
      strengths: strArray,
      weaknesses: strArray,
      verdict: { type: "string", enum: VERDICT },
    },
    ["scores", "critique", "strengths", "weaknesses", "verdict"]
  ),
  zod: z.object({
    scores: z.object({
      novelty: z.number().int(),
      correctness: z.number().int(),
      feasibility: z.number().int(),
      testability: z.number().int(),
      safety: z.number().int(),
    }),
    critique: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    verdict: z.enum(VERDICT),
  }),
};

// ---- Ranking: a single debate result --------------------------------------

export const MatchOut = {
  jsonSchema: obj(
    {
      winner: { type: "string", enum: ["A", "B"] },
      reasoning: { type: "string" },
      marginCloseness: { type: "string", enum: ["clear", "narrow"] },
    },
    ["winner", "reasoning", "marginCloseness"]
  ),
  zod: z.object({
    winner: z.enum(["A", "B"]),
    reasoning: z.string(),
    marginCloseness: z.enum(["clear", "narrow"]),
  }),
};

// ---- Proximity: clusters ---------------------------------------------------

export const ClusterOut = {
  jsonSchema: obj(
    {
      clusters: {
        type: "array",
        items: obj(
          {
            label: { type: "string" },
            hypothesisIds: strArray,
            redundancyNote: { type: "string" },
          },
          ["label", "hypothesisIds", "redundancyNote"]
        ),
      },
    },
    ["clusters"]
  ),
  zod: z.object({
    clusters: z.array(
      z.object({
        label: z.string(),
        hypothesisIds: z.array(z.string()),
        redundancyNote: z.string(),
      })
    ),
  }),
};

// ---- Meta-review -----------------------------------------------------------

export const MetaReviewOut = {
  jsonSchema: obj(
    {
      researchOverview: { type: "string" },
      recurringStrengths: strArray,
      recurringWeaknesses: strArray,
      gaps: strArray,
      generationFeedback: { type: "string" },
    },
    [
      "researchOverview",
      "recurringStrengths",
      "recurringWeaknesses",
      "gaps",
      "generationFeedback",
    ]
  ),
  zod: z.object({
    researchOverview: z.string(),
    recurringStrengths: z.array(z.string()),
    recurringWeaknesses: z.array(z.string()),
    gaps: z.array(z.string()),
    generationFeedback: z.string(),
  }),
};
