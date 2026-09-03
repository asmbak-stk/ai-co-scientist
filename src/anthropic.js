// Real Claude engine — wraps the official Anthropic SDK.
//
// Centralizes the model rules so individual agents can't violate them:
//   - model: claude-opus-4-8 (reasoning) / claude-haiku-4-5 (cheap structural step)
//   - thinking: adaptive only (NO budget_tokens / temperature / top_p — they 400 on Opus 4.8)
//   - effort via output_config.effort
//   - structured output via output_config.format (json_schema)
//   - prompt caching via the shared cachedSystem() prefix
//   - optional server-side web_search tool

import Anthropic from "@anthropic-ai/sdk";
import { cachedSystem } from "./cache.js";

const MODELS = {
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5",
};

// $ per 1M tokens
const PRICE = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

function estimateCost(model, usage) {
  const p = PRICE[model] || PRICE["claude-opus-4-8"];
  const inTok = usage.input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  return (
    (inTok * p.in +
      cacheRead * p.in * 0.1 +
      cacheWrite * p.in * 1.25 +
      outTok * p.out) /
    1_000_000
  );
}

function usageOf(model, usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens || 0,
    costEstimate: estimateCost(model, usage),
  };
}

function firstText(message) {
  for (const block of message.content || []) {
    if (block.type === "text") return block.text;
  }
  return "";
}

export function makeClaudeEngine({ goal, webSearch = false }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ENGINE=claude requires ANTHROPIC_API_KEY. Set it in .env, or use ENGINE=mock."
    );
  }
  const client = new Anthropic({ apiKey, maxRetries: 4 });
  const tools = webSearch
    ? [{ type: "web_search_20260209", name: "web_search" }]
    : undefined;

  async function complete({
    agent,
    userContent,
    schema,
    model = "opus",
    stream = false,
    emit,
    signal,
    allowWebSearch = false,
  }) {
    const modelId = MODELS[model] || MODELS.opus;
    const useTools = allowWebSearch && tools ? tools : undefined;

    const params = {
      model: modelId,
      max_tokens: stream ? 16000 : 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: model === "haiku" ? "medium" : "high",
        format: { type: "json_schema", schema: schema.jsonSchema },
      },
      system: cachedSystem(goal),
      messages: [{ role: "user", content: userContent }],
      ...(useTools ? { tools: useTools } : {}),
    };

    let message;
    if (stream) {
      const s = client.messages.stream(params, { signal });
      if (emit && agent) {
        s.on("text", (delta) => emit("agent.delta", { agent, text: delta }));
      }
      message = await s.finalMessage();
    } else {
      message = await client.messages.create(params, { signal });
    }

    // web_search may pause the server-side tool loop; resume until it finishes.
    let guard = 0;
    while (message.stop_reason === "pause_turn" && guard < 5) {
      guard += 1;
      message = await client.messages.create(
        {
          ...params,
          messages: [
            { role: "user", content: userContent },
            { role: "assistant", content: message.content },
          ],
        },
        { signal }
      );
    }

    const usage = usageOf(modelId, message.usage);
    const text = firstText(message);
    let data;
    try {
      data = schema.zod.parse(JSON.parse(text));
    } catch (err) {
      throw new Error(
        `${agent}: failed to parse structured output (${err.message}). Raw: ${text.slice(0, 200)}`
      );
    }
    return { data, usage };
  }

  return { mode: "claude", model: MODELS.opus, webSearch: !!tools, complete };
}
