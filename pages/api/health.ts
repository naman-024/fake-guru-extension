import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    status: "ok",
    service: "Fake Guru Buster API",
    version: "1.0.0",
    endpoints: ["/api/analyze", "/api/rephrase", "/api/feedback"],
  });
}
