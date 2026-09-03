// Engine selector. Agents call `engine.complete(...)`, never the SDK directly,
// so the mock and Claude engines are fully interchangeable.

import { makeMockEngine } from "./mock.js";
import { makeClaudeEngine } from "./anthropic.js";

export function currentMode() {
  return (process.env.ENGINE || "mock").toLowerCase() === "claude" ? "claude" : "mock";
}

export function makeEngine({ goal, webSearch = false }) {
  if (currentMode() === "claude") {
    return makeClaudeEngine({ goal, webSearch });
  }
  return makeMockEngine();
}
