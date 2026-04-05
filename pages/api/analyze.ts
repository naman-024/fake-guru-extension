import type { NextApiRequest, NextApiResponse } from "next";
import { analyzeCreator, type AnalysisResult } from "@/lib/claude";
import {
  fetchTranscriptsForChannel,
  getChannelIdFromVideo,
  getVideoTitleFromApi,
} from "@/lib/youtube";

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

  if (!videoId) {
    return res.status(400).json({ error: "videoId is required" });
  }

  // Auto-resolve channelId from the videoId if the extension couldn't detect it
  if (!channelId) {
    channelId = await getChannelIdFromVideo(videoId);
  }

  if (!channelId) {
    return res.status(400).json({
      error: "Could not determine channelId. Make sure YOUTUBE_API_KEY is set in Vercel environment variables.",
    });
  }

  // Auto-resolve title if blank
  if (!title || title.trim() === "") {
    title = await getVideoTitleFromApi(videoId);
  }

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
