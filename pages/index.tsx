import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Fake Guru Buster</title>
        <meta name="description" content="AI fact-checker for YouTube gurus" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 680, margin: "0 auto", padding: "48px 24px", color: "#1a1a1a" }}>

        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 8px" }}>Fake Guru Buster</h1>
          <p style={{ fontSize: 16, color: "#666", margin: 0 }}>AI-powered fact-checker that exposes misleading claims on YouTube</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 40 }}>
          {[
            { label: "API Status", value: "Live", color: "#16a34a" },
            { label: "Videos analyzed", value: "Cross-references 5+", color: "#2563eb" },
            { label: "AI Engine", value: "Claude Sonnet", color: "#7c3aed" },
          ].map((card) => (
            <div key={card.label} style={{ background: "#f9f9f9", borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#f9f9f9", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>API Endpoints</h2>
          {[
            { method: "POST", path: "/api/analyze", desc: "Analyze a YouTube video + channel. Send { videoId, channelId, title }. Returns full verdict, claims, and ready-to-post comment." },
            { method: "POST", path: "/api/rephrase", desc: "Rephrase a generated comment. Send { comment, feedback }. Returns 3 alternative versions." },
            { method: "POST", path: "/api/feedback", desc: "Store user feedback on a comment. Send { videoId, channelId, rating: 'helpful'|'not_helpful', editedComment? }." },
            { method: "GET", path: "/api/health", desc: "Health check. Returns service status and version." },
          ].map((ep) => (
            <div key={ep.path} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #eee", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: ep.method === "POST" ? "#2563eb" : "#16a34a", background: ep.method === "POST" ? "#eff6ff" : "#f0fdf4", padding: "2px 7px", borderRadius: 5, marginTop: 1, flexShrink: 0 }}>{ep.method}</span>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{ep.path}</div>
                <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>{ep.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px", color: "#92400e" }}>Required environment variables</h2>
          <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 2, color: "#78350f" }}>
            {["ANTHROPIC_API_KEY — from console.anthropic.com",
              "YOUTUBE_API_KEY — from console.cloud.google.com",
              "SUPADATA_API_KEY — from supadata.ai (free tier)"].map(v => (
              <div key={v} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "#d97706" }}>›</span> {v}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#92400e", margin: "10px 0 0" }}>
            Add these in your Vercel project → Settings → Environment Variables
          </p>
        </div>

        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px", color: "#14532d" }}>Next steps</h2>
          <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.8 }}>
            {[
              "1. Add your environment variables in Vercel dashboard",
              "2. Download the extension/ folder from this repo",
              "3. Update BACKEND_URL in extension/src/background/index.js",
              "4. Open chrome://extensions → Enable Developer Mode → Load unpacked → select extension/",
              "5. Visit a YouTube video and click the extension icon",
            ].map(s => <div key={s}>{s}</div>)}
          </div>
        </div>

      </main>
    </>
  );
}
