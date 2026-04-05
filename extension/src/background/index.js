// Update this after deploying to Vercel
const BACKEND_URL = "https://fake-guru-buster.vercel.app";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "VIDEO_DETECTED") {
    handleVideoDetected(msg.payload);
    sendResponse({ ok: true });
  }
  if (msg.type === "REPHRASE") {
    handleRephrase(msg.payload).then(sendResponse);
    return true;
  }
  if (msg.type === "FEEDBACK") {
    handleFeedback(msg.payload).then(sendResponse);
    return true;
  }
});

async function handleVideoDetected({ videoId, channelId, title }) {
  // Tell sidebar we're loading
  broadcastToContent({ type: "ANALYSIS_LOADING", payload: { videoId, title } });

  try {
    const res = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, channelId, title }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      broadcastToContent({ type: "ANALYSIS_ERROR", payload: { message: err.error } });
      return;
    }

    const result = await res.json();
    broadcastToContent({ type: "ANALYSIS_RESULT", payload: result });

    // Cache result locally
    await chrome.storage.local.set({ [`result_${videoId}`]: result });
  } catch (err) {
    broadcastToContent({
      type: "ANALYSIS_ERROR",
      payload: { message: err.message || "Network error — is the backend running?" },
    });
  }
}

async function handleRephrase({ comment, feedback }) {
  const res = await fetch(`${BACKEND_URL}/api/rephrase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment, feedback }),
  });
  return res.ok ? res.json() : [];
}

async function handleFeedback(payload) {
  const res = await fetch(`${BACKEND_URL}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok ? res.json() : { ok: false };
}

async function broadcastToContent(msg) {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  for (const tab of tabs) {
    if (tab.id) chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  }
}
