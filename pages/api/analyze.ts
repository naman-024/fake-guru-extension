import type { NextApiRequest, NextApiResponse } from "next";
import { analyzeCreator, type AnalysisResult } from "@/lib/claude";
import {
  fetchTranscriptsForChannel,
  getChannelIdFromVideo,
  getVideoTitleFromApi,
} from "@/lib/youtube";

function isValidChannelId(id: string | null | undefined): boolean {
  if (!id) return false;
  // Reject domains, IPs, full URLs — only allow plain IDs or handles
  if (id.includes(".") || id.includes("/") || id.includes(":")) return false;
  if (id.length < 2) return false;
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalysisResult | { error: string }>
) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let { videoId, channelId, title } = req.body as {
    videoId?: string;
    channelId?: string | null;
    title?: string;
  };

  if (!videoId || typeof videoId !== "string") {
    return res.status(400).json({ error: "videoId is required" });
  }

  // Sanitize channelId — reject garbage like "www.youtube.com"
  if (!isValidChannelId(channelId)) {
    channelId = null;
  }

  // If still null, resolve from videoId via YouTube API
  if (!channelId) {
    console.log(`[analyze] channelId missing or invalid, resolving from videoId ${videoId}`);
    channelId = await getChannelIdFromVideo(videoId);
  }

  if (!channelId) {
    return res.status(400).json({
      error:
        "Could not determine channelId. Ensure YOUTUBE_API_KEY is set in Vercel environment variables.",
    });
  }

  // Resolve blank title from YouTube API
  if (!title || title.trim() === "") {
    title = await getVideoTitleFromApi(videoId);
  }

  console.log(`[analyze] videoId=${videoId} channelId=${channelId} title="${title}"`);

  try {
    const transcripts = await fetchTranscriptsForChannel(channelId, videoId, title);
    const result = await analyzeCreator(transcripts, title);
    return res.status(200).json(result);
  } catch (err) {
    console.error("/api/analyze error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Analysis failed",
    });
  }
}

export const config = { api: { bodyParser: true } };
