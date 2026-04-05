"use strict";

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  phase: "idle",        // idle | loading | done | error
  result: null,
  comment: "",
  rephrases: [],
  selectedRephrase: -1,
  feedback: null,       // helpful | not_helpful
  videoId: null,
  title: "",
  errorMsg: "",
  showClaims: false,
  rephrasing: false,
};

// ── Listen for messages from content script ───────────────────────────────
window.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg?.type) return;

  if (msg.type === "ANALYSIS_LOADING") {
    state = { ...state, phase: "loading", result: null, comment: "", rephrases: [], selectedRephrase: -1, feedback: null, videoId: msg.payload.videoId, title: msg.payload.title, errorMsg: "", showClaims: false };
    render();
  }
  if (msg.type === "ANALYSIS_RESULT") {
    state = { ...state, phase: "done", result: msg.payload, comment: msg.payload.comment, rephrases: msg.payload.rephrased_variants || [] };
    render();
  }
  if (msg.type === "ANALYSIS_ERROR") {
    state = { ...state, phase: "error", errorMsg: msg.payload.message };
    render();
  }
});

// ── Actions ───────────────────────────────────────────────────────────────
function setComment(text) {
  state.comment = text;
  render();
}

function selectRephrase(i) {
  state.selectedRephrase = i;
  state.comment = state.rephrases[i];
  render();
}

async function rephrase() {
  if (!state.comment) return;
  state.rephrasing = true;
  render();
  const feedback = prompt("Any direction for rephrasing? (optional, press Enter to skip)", "") ?? "";
  try {
    const res = await chrome.runtime.sendMessage({ type: "REPHRASE", payload: { comment: state.comment, feedback } });
    if (Array.isArray(res)) { state.rephrases = res; state.selectedRephrase = -1; }
  } catch (_) {}
  state.rephrasing = false;
  render();
}

async function sendFeedback(rating) {
  state.feedback = rating;
  render();
  await chrome.runtime.sendMessage({
    type: "FEEDBACK",
    payload: { videoId: state.videoId, rating, editedComment: state.comment },
  });
}

function postComment() {
  window.parent.postMessage({ type: "INJECT_COMMENT", text: state.comment }, "*");
}

function toggleClaims() {
  state.showClaims = !state.showClaims;
  render();
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById("root");
  root.innerHTML = buildHTML();
  attachListeners();
}

function buildHTML() {
  return `
    <div class="header">
      <span class="logo"><span>⚡</span> Fake Guru Buster</span>
      ${buildStatusPill()}
    </div>
    ${buildBody()}
  `;
}

function buildStatusPill() {
  const map = { idle: ["idle", "Waiting"], loading: ["loading", "Analyzing…"], done: ["done", "Done"], error: ["error", "Error"] };
  const [cls, label] = map[state.phase];
  return `<span class="status-pill ${cls}"><span class="dot"></span>${label}</span>`;
}

function buildBody() {
  if (state.phase === "idle") return `
    <div class="empty-state">
      <h3>Ready to fact-check</h3>
      <p>Navigate to any YouTube video or Shorts.<br>Analysis starts automatically.</p>
    </div>`;

  if (state.phase === "loading") return `
    <div class="empty-state">
      <h3>Analyzing "${truncate(state.title, 40)}"</h3>
      <p>Fetching transcripts from 5+ videos,<br>checking claims against the web…<br><br>This takes about 15–30 seconds.</p>
    </div>`;

  if (state.phase === "error") return `
    <div class="verdict-bar false">
      <div class="verdict-label">Error</div>
      <div class="verdict-summary">${esc(state.errorMsg)}</div>
    </div>
    <p style="font-size:12px;color:#6b7280;margin-top:8px;">Make sure your Vercel backend is deployed and environment variables are set.</p>`;

  if (state.phase === "done" && state.result) return buildResult();
  return "";
}

function buildResult() {
  const r = state.result;
  const biasColor = r.bias_score <= 3 ? "#16a34a" : r.bias_score <= 6 ? "#d97706" : "#dc2626";
  const biasWidth = Math.round(r.bias_score * 10);
  const charCount = state.comment.length;
  const over = charCount > 280;

  return `
    <div class="videos-badge">
      Analyzed ${r.videos_analyzed ?? "5+"} videos from this channel
    </div>

    <div class="verdict-bar ${r.verdict}">
      <div class="verdict-label">${r.verdict.toUpperCase()}</div>
      <div class="verdict-summary">${esc(r.summary)}</div>
    </div>

    <div class="bias-row">
      <span class="bias-label">Bias score</span>
      <div class="bias-track">
        <div class="bias-fill" style="width:${biasWidth}%;background:${biasColor}"></div>
      </div>
      <span class="bias-num" style="color:${biasColor}">${r.bias_score}/10</span>
    </div>

    <div class="section-title">Generated comment</div>
    <div class="comment-box">
      <textarea class="comment-textarea" id="comment-ta" rows="5">${esc(state.comment)}</textarea>
      <div class="char-count ${over ? "over" : ""}">${charCount}/280</div>
    </div>

    <div class="btn-row">
      <button class="btn primary" id="btn-post">Post to YouTube</button>
      <button class="btn" id="btn-rephrase">${state.rephrasing ? "Rephrasing…" : "Rephrase ↻"}</button>
      <button class="btn" id="btn-claims">${state.showClaims ? "Hide claims" : "Show claims (${(r.claims || []).length})"}</button>
    </div>

    ${state.rephrases.length ? buildRephrases() : ""}
    ${state.showClaims ? buildClaims(r.claims || []) : ""}
    ${buildSources(r.sources || [])}

    <div class="feedback-row">
      <button class="feedback-btn ${state.feedback === "helpful" ? "selected-helpful" : ""}" id="btn-helpful">👍 Helpful</button>
      <button class="feedback-btn ${state.feedback === "not_helpful" ? "selected-not" : ""}" id="btn-not">👎 Not helpful</button>
    </div>
  `;
}

function buildRephrases() {
  return `
    <div class="section-title" style="margin-top:12px">Rephrase options — click to use</div>
    <div class="rephrase-list">
      ${state.rephrases.map((r, i) => `
        <div class="rephrase-item ${state.selectedRephrase === i ? "selected" : ""}" data-rephrase="${i}">
          ${esc(r)}
        </div>`).join("")}
    </div>`;
}

function buildClaims(claims) {
  if (!claims.length) return `<p style="font-size:12px;color:#9ca3af;margin-bottom:12px">No specific claims extracted.</p>`;
  return `
    <div class="section-title" style="margin-top:12px">Claims analyzed</div>
    ${claims.map(c => `
      <div class="claim-card">
        <div class="claim-quote">"${esc(truncate(c.quote, 120))}"</div>
        <div class="claim-verdict ${c.verdict}">${c.verdict.toUpperCase()}</div>
        <div class="claim-explanation">${esc(c.explanation)}</div>
        ${c.evidence_urls?.length ? `<div style="margin-top:5px">${c.evidence_urls.slice(0,2).map(u => `<a href="${u}" target="_blank" style="font-size:11px;color:#2563eb;display:block;word-break:break-all;margin-top:2px">${truncate(u, 60)}</a>`).join("")}</div>` : ""}
      </div>`).join("")}`;
}

function buildSources(sources) {
  if (!sources.length) return "";
  return `
    <div class="section-title" style="margin-top:12px">Sources</div>
    ${sources.slice(0, 4).map(s => `
      <div style="font-size:12px;margin-bottom:6px">
        <a href="${s.url}" target="_blank" style="color:#2563eb;font-weight:500">${esc(truncate(s.title, 55))}</a>
        <span style="color:#6b7280"> — ${esc(s.relevance)}</span>
      </div>`).join("")}`;
}

// ── Attach listeners (after each render) ────────────────────────────────
function attachListeners() {
  const ta = document.getElementById("comment-ta");
  if (ta) ta.addEventListener("input", (e) => setComment(e.target.value));

  document.getElementById("btn-post")?.addEventListener("click", postComment);
  document.getElementById("btn-rephrase")?.addEventListener("click", rephrase);
  document.getElementById("btn-claims")?.addEventListener("click", toggleClaims);
  document.getElementById("btn-helpful")?.addEventListener("click", () => sendFeedback("helpful"));
  document.getElementById("btn-not")?.addEventListener("click", () => sendFeedback("not_helpful"));

  document.querySelectorAll("[data-rephrase]").forEach((el) => {
    el.addEventListener("click", () => selectRephrase(parseInt(el.dataset.rephrase)));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function truncate(str, n) {
  return str?.length > n ? str.slice(0, n) + "…" : str ?? "";
}

// ── Init ─────────────────────────────────────────────────────────────────
render();
