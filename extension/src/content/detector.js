let lastVideoId = null;
let sidebarFrame = null;

function getVideoId() {
  const url = new URL(window.location.href);
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const m = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getChannelId() {
  const selectors = [
    "ytd-video-owner-renderer a#channel-name",
    "ytd-video-owner-renderer a.yt-simple-endpoint",
    "#owner ytd-channel-name a",
    "#owner #channel-name a",
    "ytd-channel-name a.yt-formatted-string",
    "#above-the-fold #owner-name a",
    "ytd-slim-owner-renderer a",
    "ytd-reel-player-overlay-renderer #channel-name a",
    "ytd-reel-video-renderer[is-active] ytd-channel-name a",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el || !el.href) continue;

    const href = el.href;

    // Must be a youtube.com URL — skip anything else
    if (!href.includes("youtube.com")) continue;

    // Priority 1: /channel/UC... (full channel ID)
    const byId = href.match(/\/channel\/(UC[a-zA-Z0-9_-]{10,})/);
    if (byId) return byId[1];

    // Priority 2: /@handle (mandatory @ — avoids matching www.youtube.com)
    const byHandle = href.match(/\/@([a-zA-Z0-9._-]{2,})/);
    if (byHandle) return byHandle[1];

    // Priority 3: /c/CustomName or /user/LegacyName
    const byCustom = href.match(/\/(?:c|user)\/([a-zA-Z0-9._-]{2,})/);
    if (byCustom) return byCustom[1];
  }

  return null;
}

function getVideoTitle() {
  // Try multiple selectors — YouTube changes layout often
  const selectors = [
    "h1.ytd-video-primary-info-renderer yt-formatted-string",
    "h1.style-scope.ytd-video-primary-info-renderer",
    "#title h1 yt-formatted-string",
    "#title h1",
    "ytd-video-primary-info-renderer h1",
    "ytd-reel-player-header-renderer h2",
    ".ytd-video-primary-info-renderer h1",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text && text.length > 2) return text;
  }
  // Fall back to page title, strip " - YouTube" suffix
  return document.title.replace(/\s*[-|]\s*YouTube\s*$/, "").trim();
}

function isValidChannelId(id) {
  if (!id) return false;
  // Reject anything that looks like a domain, IP, or full URL
  if (id.includes(".") || id.includes("/") || id.includes(":")) return false;
  if (id.length < 2) return false;
  return true;
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

  // Retry up to 6 times — YouTube renders channel info after URL changes
  let attempts = 0;
  function tryDetect() {
    attempts++;
    const rawChannelId = getChannelId();
    const channelId = isValidChannelId(rawChannelId) ? rawChannelId : null;
    const title = getVideoTitle();

    console.log(`[FGB] attempt ${attempts}: videoId=${videoId} channelId=${channelId} title=${title}`);

    if (channelId || attempts >= 6) {
      chrome.runtime.sendMessage({
        type: "VIDEO_DETECTED",
        payload: { videoId, channelId, title },
      });
    } else {
      setTimeout(tryDetect, 1000);
    }
  }

  setTimeout(tryDetect, 1500);
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

// Forward analysis results from background → sidebar iframe
chrome.runtime.onMessage.addListener((msg) => {
  if ((msg.type === "ANALYSIS_RESULT" || msg.type === "ANALYSIS_LOADING" || msg.type === "ANALYSIS_ERROR") && sidebarFrame) {
    sidebarFrame.contentWindow?.postMessage(msg, "*");
  }
});

// Forward "inject comment" from sidebar → YouTube comment box
window.addEventListener("message", (e) => {
  if (e.data?.type === "INJECT_COMMENT") injectCommentIntoYouTube(e.data.text);
});

function injectCommentIntoYouTube(text) {
  const box = document.querySelector("#simplebox-placeholder, ytd-comment-simplebox-renderer");
  if (box) box.click();
  setTimeout(() => {
    const editor = document.querySelector("#contenteditable-root, div[contenteditable='true']");
    if (editor) {
      editor.focus();
      document.execCommand("insertText", false, text);
    }
  }, 700);
}

// Init on page load
const initialId = getVideoId();
if (initialId) { lastVideoId = initialId; setTimeout(() => onVideoChange(initialId), 2000); }
watchUrlChanges();
