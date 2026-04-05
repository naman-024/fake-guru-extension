import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Best Groq model for reasoning tasks
const MODEL = "llama-3.3-70b-versatile";

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

// ── Brave Search for web evidence ────────────────────────────────────────────
interface BraveResult {
  title: string;
  url: string;
  description: string;
}

async function searchWeb(query: string): Promise<BraveResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": apiKey,
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { title: string; url: string; description: string }[] };
    };
    return data.web?.results ?? [];
  } catch (_) {
    return [];
  }
}

async function gatherEvidence(transcripts: { text: string | unknown }[]): Promise<string> {
  // Coerce text to string — Supadata may return arrays of segment objects
  const rawText = transcripts[0]?.text;
  const textStr: string =
    typeof rawText === "string" ? rawText :
    Array.isArray(rawText) ? rawText.map((s: unknown) =>
      typeof s === "string" ? s : (s as { text?: string })?.text ?? ""
    ).join(" ") : String(rawText ?? "");

  const snippet = textStr.slice(0, 800);

  // Pull 2 searches: general channel topic + fact-check angle
  const words = snippet.split(/\s+/).slice(0, 8).join(" ");
  const [general, factCheck] = await Promise.all([
    searchWeb(words),
    searchWeb(`fact check ${words}`),
  ]);

  const all = [...general, ...factCheck].slice(0, 6);
  if (!all.length) return "No web evidence retrieved.";

  return all
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join("\n\n");
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a rigorous, evidence-based fact-checker focused on exposing misleading claims made by online "gurus" — people who sell courses, coaching, or advice using exaggerated success stories, false statistics, and manipulative tactics.

Rules:
- Follow evidence only — no political bias
- Attack claims, never the person
- Acknowledge when content is accurate — do not invent problems
- Tone: firm, factual, polite — like a knowledgeable friend correcting misinformation

Your tasks:
1. Extract specific factual claims: income figures, statistics, scientific assertions, historical facts, promises about results
2. Cross-reference the provided web evidence snippets to verify or dispute each claim
3. Detect patterns across all videos: contradictions, escalating claims, fake urgency, cherry-picked data, appeal to authority without credentials
4. Rate bias on 0–10 scale:
   0-2 = mostly factual | 3-4 = some exaggeration | 5-6 = significant misleading claims | 7-8 = systematic misinformation | 9-10 = deliberate deception
5. Write a YouTube comment under 280 characters that is firm, factual, and cites one key fact

Output ONLY valid JSON — no markdown fencing, no text before or after:
{
  "verdict": "accurate|misleading|false|unverifiable",
  "bias_score": 0,
  "claims": [
    {
      "quote": "exact words from transcript",
      "verdict": "supported|disputed|false|exaggerated",
      "explanation": "why, with evidence reference",
      "evidence_urls": ["url from the provided web results"]
    }
  ],
  "comment": "under 280 chars, factual, one key citation",
  "rephrased_variants": [
    "direct version — states the fact plainly",
    "polite version — softer tone, same facts",
    "question version — asks a pointed question"
  ],
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "one sentence" }
  ],
  "summary": "2 sentences max — plain English verdict for the UI"
}`;

// ── Main analysis function ────────────────────────────────────────────────────
export async function analyzeCreator(
  transcripts: { videoId: string; title: string; text: string }[],
  currentVideoTitle: string
): Promise<AnalysisResult> {
  // Step 1: gather web evidence in parallel with prompt construction
  const webEvidence = await gatherEvidence(transcripts);

  const transcriptBlock = transcripts
    .map((t, i) => {
      const txt = typeof t.text === "string" ? t.text :
        Array.isArray(t.text) ? (t.text as {text?:string}[]).map(s => s?.text ?? "").join(" ") :
        String(t.text ?? "");
      return `=== VIDEO ${i + 1}: "${t.title}" ===\n${txt.slice(0, 2500)}`;
    })
    .join("\n\n");

  const userMessage = `Analyze these ${transcripts.length} videos from the same YouTube creator.
Currently watching: "${currentVideoTitle}"

WEB EVIDENCE (use URLs from here when citing sources):
${webEvidence}

TRANSCRIPTS:
${transcriptBlock}

Focus your comment on the current video. Use the other ${transcripts.length - 1} videos to detect patterns and contradictions. Use the web evidence above to verify claims.
Return ONLY the JSON object.`;

  // Step 2: call Groq
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,  // low temp for factual consistency
    max_tokens: 1500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  // Strip markdown fences, then extract the JSON object even if LLM adds text around it
  const fenceStripped = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = fenceStripped.match(/\{[\s\S]*\}/);
  const clean = jsonMatch ? jsonMatch[0] : fenceStripped;

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(clean) as AnalysisResult;
  } catch {
    throw new Error(`Groq returned non-JSON response. Raw: ${raw.slice(0, 200)}`);
  }

  // Ensure all expected fields exist and are the right type
  parsed.verdict = parsed.verdict ?? "unverifiable";
  parsed.bias_score = Number(parsed.bias_score ?? 0);
  parsed.claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  parsed.comment = typeof parsed.comment === "string" ? parsed.comment : "";
  parsed.rephrased_variants = Array.isArray(parsed.rephrased_variants) ? parsed.rephrased_variants : [];
  parsed.sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  parsed.summary = typeof parsed.summary === "string" ? parsed.summary : "";
  parsed.videos_analyzed = transcripts.length;
  return parsed;
}

// ── Rephrase function ─────────────────────────────────────────────────────────
export async function rephraseComment(
  original: string,
  feedback: string
): Promise<string[]> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Rephrase this YouTube fact-checking comment in 3 ways.
User feedback: "${feedback}"
Original: "${original}"

Rules: keep all facts, each version under 280 chars, vary the tone (direct / polite / question).
Return ONLY a JSON array of 3 strings, nothing else.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  const fenceStripped = raw.replace(/```json|```/g, "").trim();
  const arrMatch = fenceStripped.match(/\[[\s\S]*\]/);
  const clean = arrMatch ? arrMatch[0] : fenceStripped;
  try {
    const result = JSON.parse(clean);
    return Array.isArray(result) ? result.map(String) : [];
  } catch {
    return [];
  }
}
