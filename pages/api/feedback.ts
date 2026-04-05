import type { NextApiRequest, NextApiResponse } from "next";
import { storeFeedback, getFeedbackSummary } from "@/lib/feedback";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { videoId, channelId, rating, editedComment } = req.body as {
      videoId?: string;
      channelId?: string;
      rating?: "helpful" | "not_helpful";
      editedComment?: string;
    };

    if (!videoId || !rating) {
      return res.status(400).json({ error: "videoId and rating are required" });
    }

    storeFeedback({ videoId, channelId: channelId ?? "", rating, editedComment, timestamp: Date.now() });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "GET") {
    return res.status(200).json(getFeedbackSummary());
  }

  return res.status(405).json({ error: "Method not allowed" });
}
