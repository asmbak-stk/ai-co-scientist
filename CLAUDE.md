# CLAUDE.md — AI Co-Scientist

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this is
A **standalone** prototype of an "AI co-scientist": a multi-agent system that takes a
natural-language research goal and autonomously generates, critiques, ranks, and evolves
research hypotheses. Inspired by Google DeepMind's AI co-scientist. It is NOT connected to
any other project — treat this repo as self-contained.

A small Node backend proxies the model and runs the agent loop; a vanilla-JS frontend
shows the "tournament" live over Server-Sent Events (SSE).

## Two engines (this is the core design seam)
Agents NEVER call the SDK directly — they call `engine.complete(...)`. Two engines
implement the same contract and are chosen by the `ENGINE` env var:
- `ENGINE=mock` (default): no API key, no API calls, no cost. Fabricates varied hypotheses
  via `src/mock.js`. Use this for developing/testing the orchestration, SSE, and frontend.
- `ENGINE=claude`: real Anthropic API via `src/anthropic.js`.

When adding or changing an agent, keep both engines working: the mock path must produce
data of the same shape as the schema in `src/schemas.js`.

## Run it
```bash
npm install
cp .env.example .env     # mock works with no key
npm start                # node --env-file=.env src/server.js → http://localhost:8787
```
For the real engine, set `ENGINE=claude` and `ANTHROPIC_API_KEY` in `.env`.

## Anthropic API rules (authoritative — do not violate)
These are enforced centrally in `src/anthropic.js`; keep them there.
- Model: `claude-opus-4-8` for reasoning agents; `claude-haiku-4-5` for the cheap
  Proximity/clustering step.
- Thinking: adaptive only — `thinking: { type: "adaptive" }`. Do NOT use `budget_tokens`,
  `temperature`, or `top_p` (they return HTTP 400 on Opus 4.8).
- Effort via `output_config: { effort: "high" }` (Opus) / `"medium"` (Haiku).
- Structured output via `output_config: { format: { type: "json_schema", schema } }`.
  JSON-schema limits: every object needs `additionalProperties: false`; NO `minLength` /
  `maximum` / `multipleOf`. Enforce bounds in the Zod layer, validate after the call.
- Streaming via `messages.stream()` for the long agents (generation, meta-review).
- Prompt caching: the shared system prefix in `src/cache.js` (framing + research goal)
  must stay byte-identical across every call in a run — role-specific instructions and
  volatile content go in the user message, never in the system block. Verify with
  `usage.cache_read_input_tokens > 0` on the 2nd+ call.
- `web_search_20260209` is optional (env toggle); every agent must still work with no tools.

## Architecture
```
src/
  server.js      HTTP + SSE server; serves public/, starts/streams runs (in-memory Map<runId>)
  engine.js      selects mock | claude engine
  anthropic.js   real Claude engine.complete() — all model rules live here
  mock.js        mock engine.complete() + canned content generators
  cache.js       cachedSystem(goal) — the shared cached prefix
  schemas.js     JSON Schema (for the API) + Zod (for validation), per agent
  state.js       RunState — hypotheses, reviews, eloById, matchHistory, clusters, metaReview, usage
  supervisor.js  runResearch() — sequences the six agents across rounds, emits SSE
  elo.js         Elo math + Swiss-style match scheduling
  pool.js        mapLimit() bounded-concurrency helper
  format.js      compact text renderers for prompts
  agents/
    generation.js reflection.js ranking.js evolution.js proximity.js metaReview.js
public/
  index.html app.js style.css   — vanilla JS, EventSource client
```

## Orchestration (src/supervisor.js)
Per round: Generation → Reflection (reviews everything unreviewed) → Ranking (Elo
tournament) → Evolution (improves top-2) → Proximity (clusters) → Meta-review (feedback
into the next round). Terminates on `MAX_ROUNDS`, convergence (stable clear leader), or the
token budget. Everything is emitted as SSE events consumed by `public/app.js`.

## SSE event types
`run.start`, `round.start`, `agent.start`/`agent.done`, `agent.delta` (streamed tokens),
`hypothesis.new`/`hypothesis.evolved`, `review.done`, `match.start`/`match.result`,
`ranking.update`, `clusters.update`, `metareview.done`, `usage`, `note`, `round.end`,
`run.done`, `error`.

## Conventions
- ESM everywhere (`"type": "module"`). Node built-ins + `@anthropic-ai/sdk` + `zod` only —
  no bundler, no framework, no extra deps unless truly needed.
- Frontend is dependency-free vanilla JS.
- Keep runs in memory; persistence is intentionally out of scope for the prototype.

## Testing changes
The fastest check is a full mock run: start the server (`ENGINE=mock`), open the page, run a
goal, and confirm hypotheses appear, reviews fill in, matches reorder the cards by Elo,
clusters render, and the meta-review overview shows. All modules should pass `node --check`.
