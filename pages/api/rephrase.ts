import type { NextApiRequest, NextApiResponse } from "next";
import { rephraseComment } from "@/lib/claude";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string[] | { error: string }>
) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { comment, feedback } = req.body as { comment?: string; feedback?: string };
  if (!comment) return res.status(400).json({ error: "comment is required" });

  try {
    const variants = await rephraseComment(comment, feedback ?? "");
    return res.status(200).json(variants);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
}
