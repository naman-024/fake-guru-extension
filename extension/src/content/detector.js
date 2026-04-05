let lastVideoId = null;
let sidebarFrame = null;

function getVideoId() {
  const url = new URL(window.location.href);
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const m = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getChannelId() {
  // Try every known YouTube selector — they change between layouts
  const selectors = [
    "ytd-video-owner-renderer a#channel-name",
    "ytd-video-owner-renderer a.yt-simple-endpoint",
    "#owner ytd-channel-name a",
    "#owner #channel-name a",
    "ytd-channel-name a.yt-formatted-string",
    "#above-the-fold #owner-name a",
    "ytd-video-primary-info-renderer #owner-name a",
    "ytd-slim-owner-renderer a",
    "ytd-reel-player-overlay-renderer #channel-name a",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.href) {
      // href can be /channel/UCxxxxxx or /@handle
      const byId = el.href.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
      if (byId) return byId[1];
      const byHandle = el.href.match(/\/@?([^/?&#\s]+)/);
      if (byHandle) return byHandle[1];
    }
  }

  // Last resort: check canonical link or meta tags
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const m = canonical.href.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (m) return m[1];
  }

  // For Shorts: try the overlay renderer
  const shortsMeta = document.querySelector("ytd-reel-video-renderer[is-active] ytd-channel-name a");
  if (shortsMeta?.href) {
    const m = shortsMeta.href.match(/\/@?([^/?&#\s]+)/);
    if (m) return m[1];
  }

  return null;
}

function getVideoTitle() {
  const el = document.querySelector("h1.ytd-video-primary-info-renderer yt-formatted-string, h1.style-scope.ytd-video-primary-info-renderer");
  return el?.textContent?.trim() ?? document.title;
}

function injectSidebar() {
  if (document.getElementById("fgb-sidebar")) return;

  sidebarFrame = document.createElement("iframe");
  sidebarFrame.id = "fgb-sidebar";
  sidebarFrame.src = chrome.runtime.getURL("src/sidebar/index.html");
  sidebarFrame.style.cssText = [
    "position:fixed", "top:56px", "right:0",
    "width:360px", "height:calc(100vh - 56px)",
    "border:none", "border-left:1px solid #e5e7eb",
    "z-index:2147483647", "background:#fff",
    "transition:transform .25s ease",
    "box-shadow:-2px 0 12px rgba(0,0,0,0.06)"
  ].join(";");

  document.body.style.marginRight = "360px";
  document.body.appendChild(sidebarFrame);
}

function removeSidebar() {
  const el = document.getElementById("fgb-sidebar");
  if (el) el.remove();
  document.body.style.marginRight = "";
  sidebarFrame = null;
}

function onVideoChange(videoId) {
  injectSidebar();

  // Retry up to 5 times — YouTube renders channel info slowly
  let attempts = 0;
  function tryDetect() {
    attempts++;
    const channelId = getChannelId();
    const title = getVideoTitle();

    if (channelId || attempts >= 5) {
      chrome.runtime.sendMessage({
        type: "VIDEO_DETECTED",
        payload: { videoId, channelId, title },
      });
    } else {
      setTimeout(tryDetect, 800);
    }
  }

  setTimeout(tryDetect, 1200);
}

function watchUrlChanges() {
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    const videoId = getVideoId();
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      setTimeout(() => onVideoChange(videoId), 800);
    }
    if (!videoId) { removeSidebar(); lastVideoId = null; }
  }).observe(document.body, { childList: true, subtree: true });
}

// Listen for analysis results from background and forward to sidebar
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ANALYSIS_RESULT" && sidebarFrame) {
    sidebarFrame.contentWindow?.postMessage(msg, "*");
  }
  if (msg.type === "ANALYSIS_LOADING" && sidebarFrame) {
    sidebarFrame.contentWindow?.postMessage(msg, "*");
  }
});

// Listen for "inject comment" from sidebar
window.addEventListener("message", (e) => {
  if (e.data?.type === "INJECT_COMMENT") {
    injectCommentIntoYouTube(e.data.text);
  }
});

function injectCommentIntoYouTube(text) {
  const box = document.querySelector("#simplebox-placeholder, ytd-comment-simplebox-renderer");
  if (box) box.click();
  setTimeout(() => {
    const editor = document.querySelector("#contenteditable-root, div[contenteditable='true'][aria-label*='comment']");
    if (editor) {
      editor.focus();
      document.execCommand("insertText", false, text);
    }
  }, 600);
}

// Init
const initialId = getVideoId();
if (initialId) { lastVideoId = initialId; setTimeout(() => onVideoChange(initialId), 1800); }
watchUrlChanges();
