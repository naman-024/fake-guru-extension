# Fake Guru Buster

AI-powered Chrome extension + backend that fact-checks YouTube creator claims in real time, cross-referencing 5+ videos to expose misleading advice and fake gurus.

## How it works

1. Extension detects the YouTube video you're watching
2. Backend fetches transcripts from 5+ videos by the same creator
3. Claude AI extracts factual claims and verifies them via web search
4. A fact-checked comment is generated — editable, rephraseable, ready to post
5. The comment is injected directly into YouTube's comment box

## Project structure

```
├── pages/           Next.js frontend + API routes (deployed to Vercel)
│   └── api/
│       ├── analyze.ts      POST { videoId, channelId, title }
│       ├── rephrase.ts     POST { comment, feedback }
│       └── feedback.ts     POST { videoId, rating, editedComment }
├── lib/
│   ├── claude.ts           Claude API — analysis + rephrase
│   ├── youtube.ts          YouTube Data API + Supadata transcripts
│   └── feedback.ts         Feedback store
└── extension/
    ├── manifest.json
    └── src/
        ├── content/detector.js     YouTube SPA watcher + sidebar injector
        ├── background/index.js     Service worker — API calls
        └── sidebar/                UI panel (vanilla JS + CSS)
```

## Setup

### 1. Deploy backend to Vercel

```bash
npm install
vercel deploy
```

Then add environment variables in Vercel dashboard → Settings → Environment Variables:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `YOUTUBE_API_KEY` | console.cloud.google.com → YouTube Data API v3 |
| `SUPADATA_API_KEY` | supadata.ai (free tier available) |

### 2. Update extension backend URL

Edit `extension/src/background/index.js` line 2:
```js
const BACKEND_URL = "https://your-project.vercel.app";
```

### 3. Load extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### 4. Use it

Visit any YouTube video. The sidebar appears automatically on the right side. Analysis takes 15–30 seconds (fetching + AI processing).

## Features

- Cross-references 5+ videos from the same creator
- Detects: false statistics, contradictions between videos, fake urgency, exaggerated income claims, unsupported assertions
- Editable generated comment with character counter
- 3 rephrase variants (direct / polite / question)
- User feedback (helpful / not helpful) stored for improvement
- Sources listed with links
- One-click inject into YouTube comment box

## Development

```bash
npm run dev       # local Next.js server at localhost:3000
```

For local extension development, change `BACKEND_URL` to `http://localhost:3000`.
