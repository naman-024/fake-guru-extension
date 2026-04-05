import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Claim {
  quote: string;
  verdict: "supported" | "disputed" | "false" | "exaggerated";
  explanation: string;
  evidence_urls: string[];
}

export interface Source {
  url: string;
  title: string;
  relevance: string;
}

export interface AnalysisResult {
  verdict: "accurate" | "misleading" | "false" | "unverifiable";
  bias_score: number;
  claims: Claim[];
  comment: string;
  rephrased_variants: string[];
  sources: Source[];
  summary: string;
  videos_analyzed: number;
}

const SYSTEM_PROMPT = `You are a rigorous, evidence-based fact-checker focused on exposing misleading claims made by online "gurus" — people who sell courses, coaching, or advice, often using exaggerated success stories, false statistics, and manipulative tactics.

Your principles:
- You are not politically biased — you follow evidence and data only
- You attack claims, never the person
- You acknowledge when content is accurate — do not invent problems
- You cite real, verifiable sources
- Tone: like a knowledgeable friend correcting misinformation, not a troll

Your analysis tasks:
1. Extract all specific factual claims: income figures, statistics, scientific assertions, historical facts, promises about results
2. Detect cross-video patterns: contradictions between videos, escalating claims, changed stories
3. Identify manipulation tactics: fake urgency, false scarcity, cherry-picked data, appeal to authority without credentials, lifestyle flexing as proof
4. Use the web_search tool to verify the 3 most impactful claims
5. Generate a YouTube comment under 280 characters that is firm, factual, and cites one key piece of evidence

bias_score guide (0-10):
0-2: Mostly factual, minor spin
3-4: Some exaggeration or selective framing
5-6: Significant misleading claims
7-8: Systematic misinformation pattern
9-10: Deliberate deception, dangerous advice

Output ONLY valid JSON — no markdown fencing, no explanation before or after:
{
  "verdict": "accurate|misleading|false|unverifiable",
  "bias_score": 0,
  "claims": [
    {
      "quote": "exact words from transcript",
      "verdict": "supported|disputed|false|exaggerated",
      "explanation": "why, citing evidence",
      "evidence_urls": ["https://..."]
    }
  ],
  "comment": "under 280 chars, factual, one key citation",
  "rephrased_variants": [
    "direct version — states the fact plainly",
    "polite version — asks a question",
    "brief version — one punchy sentence"
  ],
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "one sentence" }
  ],
  "summary": "2 sentences max — plain English verdict for the sidebar UI"
}`;

export async function analyzeCreator(
  transcripts: { videoId: string; title: string; text: string }[],
  currentVideoTitle: string
): Promise<AnalysisResult> {
  const transcriptBlock = transcripts
    .map((t, i) => `=== VIDEO ${i + 1}: "${t.title}" ===\n${t.text.slice(0, 3000)}`)
    .join("\n\n");

  const userMessage = `Analyze these ${transcripts.length} videos from the same YouTube creator.
The user is currently watching: "${currentVideoTitle}"

${transcriptBlock}

Focus your comment on the current video. Use the other ${transcripts.length - 1} videos only to detect contradictions and patterns.
Use web_search to verify the top 3 most impactful claims before writing your verdict.
Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b: Anthropic.TextBlock) => b.text)
    .join("");

  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean) as AnalysisResult;
  parsed.videos_analyzed = transcripts.length;
  return parsed;
}

export async function rephraseComment(
  original: string,
  feedback: string
): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Rephrase this YouTube fact-checking comment 3 ways.
User feedback: "${feedback}"
Original: "${original}"

Rules: keep all facts, each under 280 chars, vary the tone (direct / polite / question).
Return ONLY a JSON array of 3 strings.`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b: Anthropic.TextBlock) => b.text)
    .join("");

  return JSON.parse(text.replace(/```json|```/g, "").trim()) as string[];
}
