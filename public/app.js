// AI Co-Scientist frontend. Starts a run, then mirrors the SSE stream into the UI.

const $ = (id) => document.getElementById(id);
const SCORE_KEYS = ["novelty", "correctness", "feasibility", "testability", "safety"];

let es = null;
let runId = null;
const cards = new Map(); // hypothesisId -> { el, data }
const streamEls = new Map(); // agent -> current stream-text element

// ---- health ----------------------------------------------------------------
fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    const badge = $("engineBadge");
    if (h.mode === "claude") {
      badge.textContent = `Claude · ${h.model}`;
      badge.classList.add("claude");
    } else {
      badge.textContent = "Mock-modus · ingen API-kall";
    }
    $("wsHint").textContent = h.webSearchEnabled ? "" : "(deaktivert på serveren)";
    if (!h.webSearchEnabled) $("webSearch").disabled = true;
    // rounds selector reflects server cap
    const sel = $("rounds");
    [...sel.options].forEach((o) => { if (Number(o.value) > h.maxRounds) o.disabled = true; });
  })
  .catch(() => {});

// ---- controls ---------------------------------------------------------------
$("startBtn").addEventListener("click", start);
$("cancelBtn").addEventListener("click", cancel);

async function start() {
  const goal = $("goal").value.trim();
  if (!goal) { $("goal").focus(); return; }

  resetUI();
  $("startBtn").disabled = true;

  const body = {
    goal,
    rounds: Number($("rounds").value),
    webSearch: $("webSearch").checked,
  };
  let res;
  try {
    res = await (await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })).json();
  } catch (e) {
    showError("Kunne ikke starte: " + e.message);
    $("startBtn").disabled = false;
    return;
  }
  if (res.error) { showError(res.error); $("startBtn").disabled = false; return; }

  runId = res.runId;
  $("cancelBtn").hidden = false;
  $("statusDot").classList.add("live");

  es = new EventSource(`/api/stream/${runId}`);
  bind();
}

function cancel() {
  if (runId) fetch(`/api/cancel/${runId}`, { method: "POST" }).catch(() => {});
  finish();
}

function finish() {
  if (es) { es.close(); es = null; }
  $("statusDot").classList.remove("live");
  $("startBtn").disabled = false;
  $("cancelBtn").hidden = true;
}

// ---- SSE binding ------------------------------------------------------------
function bind() {
  const on = (type, fn) => es.addEventListener(type, (e) => fn(JSON.parse(e.data)));

  on("run.start", (d) => {
    $("usageMode").textContent = d.mode === "claude" ? `Claude · ${d.model}` : "mock";
    log("round", `Forskningsmål satt — ${d.rounds} runde(r), motor: ${d.mode}`);
  });
  on("round.start", (d) => log("round", `Runde ${d.round}`));
  on("agent.start", (d) => {
    const labels = {
      generation: "Generation — genererer hypoteser",
      reflection: `Reflection — fagfellevurderer ${d.count ?? ""} hypoteser`,
      ranking: "Ranking — Elo-turnering",
      evolution: "Evolution — forbedrer toppen",
      proximity: "Proximity — klyngedeler",
      metaReview: "Meta-review — syntese",
    };
    const el = log(d.agent, labels[d.agent] || d.agent);
    const stream = document.createElement("div");
    stream.className = "stream-text";
    el.appendChild(stream);
    streamEls.set(d.agent, stream);
  });
  on("agent.delta", (d) => {
    const el = streamEls.get(d.agent);
    if (el) { el.textContent += d.text; scrollLog(); }
  });
  on("hypothesis.new", (d) => addCard(d.hypothesis, false));
  on("hypothesis.evolved", (d) => addCard(d.hypothesis, true));
  on("review.done", (d) => applyReview(d));
  on("match.start", (d) => log("match", `⚔ debatt: «${trim(d.a.title)}» vs «${trim(d.b.title)}»`));
  on("match.result", (d) => {
    const w = cards.get(d.winnerId);
    log("match", `→ vinner: «${trim(w ? w.data.title : d.winnerId)}» (${d.marginCloseness})`);
  });
  on("ranking.update", (d) => applyStandings(d.standings));
  on("clusters.update", (d) => renderClusters(d.clusters));
  on("metareview.done", (d) => renderOverview(d, null));
  on("usage", (d) => renderUsage(d));
  on("note", (d) => log("round", "ℹ " + d.message));
  on("round.end", () => {});
  on("run.done", (d) => {
    if (d.standings) applyStandings(d.standings);
    if (state.lastMeta) renderOverview(state.lastMeta, d.topHypothesis);
    log("round", "✓ Ferdig");
    finish();
  });
  on("error", (d) => { showError(d.message); finish(); });
  es.onerror = () => { /* EventSource auto-retries; ignore transient */ };
}

const state = { lastMeta: null };

// ---- rendering --------------------------------------------------------------
function addCard(h, evolved) {
  $("cardsPlaceholder")?.remove();
  const el = document.createElement("div");
  el.className = "card" + (evolved ? " evolved" : "");
  el.dataset.id = h.id;
  el.innerHTML = cardHTML(h, evolved);
  $("cards").appendChild(el);
  cards.set(h.id, { el, data: { ...h, elo: 1200, rank: null } });
  $("hypoCount").textContent = cards.size;
}

function cardHTML(h, evolved, review) {
  const strat = evolved && h.strategy ? `<span class="tag strategy">${h.strategy}</span>` : "";
  const derived = evolved && h.derivedFrom?.length ? `<span class="tag">fra ${h.derivedFrom.join(", ")}</span>` : "";
  const verdict = review ? `<span class="tag verdict-${review.verdict}">${review.verdict}</span>` : "";
  const scores = review ? scoresHTML(review.scores) : "";
  return `
    <div class="card-head">
      <div class="rank-badge" data-rank>–</div>
      <div>
        <div class="card-title">${esc(h.title)}</div>
        <div class="card-summary">${esc(h.summary)}</div>
        <div class="card-meta">
          <span class="elo" data-elo>Elo 1200</span>
          ${strat}${derived}${verdict}
        </div>
        <div data-scores>${scores}</div>
      </div>
    </div>`;
}

function scoresHTML(s) {
  return `<div class="scores">` + SCORE_KEYS.map((k) => `
    <div class="score">
      <div class="score-label">${k.slice(0, 4)}</div>
      <div class="score-bar"><span style="width:${(s[k] / 10) * 100}%"></span></div>
    </div>`).join("") + `</div>`;
}

function applyReview(d) {
  const c = cards.get(d.hypothesisId);
  if (!c) return;
  c.data.review = { scores: d.scores, verdict: d.verdict };
  c.el.querySelector("[data-scores]").innerHTML = scoresHTML(d.scores);
  const meta = c.el.querySelector(".card-meta");
  if (!meta.querySelector(".verdict-" + d.verdict)) {
    const v = document.createElement("span");
    v.className = "tag verdict-" + d.verdict;
    v.textContent = d.verdict;
    meta.appendChild(v);
  }
}

function applyStandings(standings) {
  if (!standings) return;
  const container = $("cards");
  standings.forEach((s, i) => {
    const c = cards.get(s.id);
    if (!c) return;
    c.data.elo = s.elo;
    c.data.rank = s.rank;
    c.el.querySelector("[data-rank]").textContent = s.rank;
    c.el.querySelector("[data-elo]").textContent = "Elo " + s.elo;
    c.el.classList.toggle("leader", i === 0);
    container.appendChild(c.el); // reorder to standings order
  });
}

function renderClusters(clusters) {
  const box = $("clusters");
  if (!clusters?.length) return;
  box.innerHTML = clusters.map((c) => `
    <div class="cluster">
      <h3>${esc(c.label)}</h3>
      <div class="chips">${c.hypothesisIds.map((id) => `<span class="chip">${chipTitle(id)}</span>`).join("")}</div>
      <div class="note">${esc(c.redundancyNote || "")}</div>
    </div>`).join("");
}

function renderOverview(meta, winner) {
  state.lastMeta = meta;
  $("overviewPanel").hidden = false;
  const w = winner
    ? `<div class="winner"><div class="wlabel">Sterkeste hypotese</div><h3>${esc(winner.title)}</h3>
        <div class="card-summary">${esc(winner.detailedDescription || winner.summary)}</div>
        <div class="card-summary"><b>Foreslått eksperiment:</b> ${esc(winner.proposedExperiment || "")}</div></div>`
    : "";
  const list = (title, items) => `<div><h4>${title}</h4><ul>${(items || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  $("overview").innerHTML =
    w +
    `<p>${esc(meta.researchOverview)}</p>` +
    `<div class="overview-lists">
      ${list("Gjentakende styrker", meta.recurringStrengths)}
      ${list("Gjentakende svakheter", meta.recurringWeaknesses)}
      ${list("Udekkede hull", meta.gaps)}
    </div>` +
    (meta.generationFeedback ? `<p class="muted"><b>Veiledning til neste runde:</b> ${esc(meta.generationFeedback)}</p>` : "");
}

function renderUsage(u) {
  if (u.mode) $("usageMode").textContent = u.mode === "claude" ? "Claude" : "mock";
  $("uCacheRead").textContent = fmt(u.cacheReadTokens);
  $("uInput").textContent = fmt(u.inputTokens);
  $("uOutput").textContent = fmt(u.outputTokens);
  $("uCost").textContent = "$" + (u.costEstimate || 0).toFixed(4);
}

// ---- helpers ----------------------------------------------------------------
function log(kind, text) {
  const item = document.createElement("div");
  item.className = "log-item " + kind;
  item.innerHTML = kind === "round" || kind === "match"
    ? `<span>${esc(text)}</span>`
    : `<span class="who">${kind}</span><div>${esc(text)}</div>`;
  $("log").appendChild(item);
  scrollLog();
  return item;
}
function scrollLog() { const l = $("log"); l.scrollTop = l.scrollHeight; }
function chipTitle(id) { const c = cards.get(id); return esc(c ? trim(c.data.title, 22) : id); }
function trim(s, n = 32) { return s && s.length > n ? s.slice(0, n) + "…" : (s || ""); }
function fmt(n) { return (n || 0).toLocaleString("no-NO"); }
function esc(s) { return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function showError(msg) {
  let b = document.querySelector(".error-banner");
  if (!b) { b = document.createElement("div"); b.className = "error-banner"; $("log").before(b); }
  b.textContent = "Feil: " + msg;
}

function resetUI() {
  document.querySelector(".error-banner")?.remove();
  $("log").innerHTML = "";
  $("cards").innerHTML = '<p class="placeholder" id="cardsPlaceholder">Genererer …</p>';
  $("clusters").innerHTML = '<p class="placeholder">Proximity-agenten grupperer like hypoteser.</p>';
  $("overviewPanel").hidden = true;
  $("hypoCount").textContent = "0";
  cards.clear();
  streamEls.clear();
  state.lastMeta = null;
}
